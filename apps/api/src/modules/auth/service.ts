import { generateCodeVerifier, generateState } from "arctic";
import { and, eq } from "drizzle-orm";
import { Elysia, status } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import type { UserModel } from "../users/model.ts";
import { User } from "../users/service.ts";
import {
  ACCESS_COOKIE,
  cookieOptions,
  elysiaCookieJar,
  REFRESH_COOKIE,
  type CookieJar,
} from "./cookie.ts";
import type { AuthModel } from "./model.ts";
import { providers, type OAuthProfile } from "./providers/index.ts";
import { accounts } from "./schema.ts";
import { Token } from "./token.ts";

export type SessionUser = UserModel["user"];

const OAUTH_COOKIES = ["oauth_state", "oauth_verifier", "oauth_redirect"];

/** Only allow same-origin relative paths as post-login redirects. */
const safeRedirect = (value: unknown) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";

const getProvider = (deps: Deps, name: string, origin: string) => {
  const create = providers[name];
  if (!create)
    throw status(404, {
      message: "Unknown provider",
    } satisfies AuthModel["unknownProvider"]);
  return create(deps.env, `${origin}/api/v1/auth/${name}/callback`);
};

/**
 * Sessions: an access token (short-lived JWT) plus a refresh token (opaque,
 * stored in D1), both in httpOnly cookies. Takes a `CookieJar` instead of
 * Elysia's context, so SvelteKit's `event.cookies` works too.
 */
export abstract class Auth {
  private static async setTokens(
    { env }: Deps,
    jar: CookieJar,
    secure: boolean,
    userId: string,
    refreshToken: string,
  ) {
    const opts = cookieOptions(secure);
    jar.set(ACCESS_COOKIE, await Token.signAccess(env.JWT_SECRET, userId), opts.access);
    jar.set(REFRESH_COOKIE, refreshToken, opts.refresh);
  }

  private static clearTokens(jar: CookieJar, secure: boolean) {
    const opts = cookieOptions(secure);
    jar.delete(ACCESS_COOKIE, { path: opts.access.path });
    jar.delete(REFRESH_COOKIE, { path: opts.refresh.path });
  }

  static async startSession(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
    userId: string,
  ) {
    const { token } = await Token.issueRefresh(deps.db, userId);
    await Auth.setTokens(deps, jar, secure, userId, token);
  }

  /** Rotates the refresh token. Returns the user id, or `null` (cookies cleared). */
  static async refreshSession(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
  ): Promise<string | null> {
    const rotated = await Token.rotateRefresh(deps.db, jar.get(REFRESH_COOKIE));
    if (!rotated) {
      Auth.clearTokens(jar, secure);
      return null;
    }
    await Auth.setTokens(deps, jar, secure, rotated.userId, rotated.refreshToken);
    return rotated.userId;
  }

  static async endSession(deps: Deps, jar: CookieJar, secure: boolean) {
    await Token.revokeRefresh(deps.db, jar.get(REFRESH_COOKIE));
    Auth.clearTokens(jar, secure);
  }

  /** The user id from the access token alone (no refresh). */
  static sessionUserId(
    { env }: Deps,
    jar: CookieJar,
  ): Promise<string | null> {
    return Token.verifyAccess(env.JWT_SECRET, jar.get(ACCESS_COOKIE));
  }

  /** The signed-in user, refreshing the session if the access token expired. */
  static async sessionUser(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
  ): Promise<SessionUser | null> {
    let userId = await Auth.sessionUserId(deps, jar);
    if (!userId && jar.get(REFRESH_COOKIE))
      userId = await Auth.refreshSession(deps, jar, secure);
    return userId ? User.findById(deps.db, userId) : null;
  }

  /** Starts an OAuth sign-in: stores state + PKCE verifier, returns the provider URL. */
  static authorizationURL(
    deps: Deps,
    providerName: string,
    { redirectTo }: AuthModel["signInQuery"],
    origin: string,
    jar: CookieJar,
    secure: boolean,
  ): string {
    const provider = getProvider(deps, providerName, origin);
    const opts = cookieOptions(secure).oauth;
    const state = generateState();
    const verifier = generateCodeVerifier();
    jar.set("oauth_state", state, opts);
    jar.set("oauth_verifier", verifier, opts);
    jar.set("oauth_redirect", safeRedirect(redirectTo), opts);
    return provider.createAuthorizationURL(state, verifier).toString();
  }

  /** Completes an OAuth sign-in and starts a session; returns where to redirect. */
  static async completeSignIn(
    deps: Deps,
    providerName: string,
    { code, state }: AuthModel["callbackQuery"],
    origin: string,
    jar: CookieJar,
    secure: boolean,
  ): Promise<string> {
    const provider = getProvider(deps, providerName, origin);
    const expectedState = jar.get("oauth_state");
    const verifier = jar.get("oauth_verifier");
    const redirectTo = safeRedirect(jar.get("oauth_redirect"));
    const { path } = cookieOptions(secure).oauth;
    for (const name of OAUTH_COOKIES) jar.delete(name, { path });

    if (!code || !verifier || !expectedState || state !== expectedState)
      throw status(400, {
        message: "Invalid OAuth state",
      } satisfies AuthModel["invalidOAuthState"]);

    let profile: OAuthProfile;
    try {
      profile = await provider.getProfile(code, verifier);
    } catch {
      throw status(400, {
        message: "OAuth code exchange failed",
      } satisfies AuthModel["oauthExchangeFailed"]);
    }

    await Auth.startSession(
      deps,
      jar,
      secure,
      await Auth.upsertOAuthUser(deps, providerName, profile),
    );
    return redirectTo;
  }

  /** Finds the user linked to this provider account, creating one if needed. */
  private static async upsertOAuthUser(
    { db }: Deps,
    provider: string,
    { id, ...profile }: OAuthProfile,
  ): Promise<string> {
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.provider, provider),
        eq(accounts.providerAccountId, id),
      ),
    });
    if (account) {
      await User.updateProfile(db, account.userId, profile);
      return account.userId;
    }
    const userId = await User.create(db, profile);
    await db
      .insert(accounts)
      .values({ provider, providerAccountId: id, userId });
    return userId;
  }
}

/**
 * Request-dependent auth service: adds an `auth: true` route option that
 * requires a valid access token cookie and resolves `user`.
 */
// Elysia dedupes named plugins by `name` + JSON of `seed`; `deps` itself is not
// serializable (the D1 client is circular), so seed with a stable id per `deps`.
const seeds = new WeakMap<Deps, number>();
let nextSeed = 0;
const seedOf = (deps: Deps) => {
  if (!seeds.has(deps)) seeds.set(deps, ++nextSeed);
  return seeds.get(deps)!;
};

export const authService = (deps: Deps) =>
  new Elysia({ name: "Auth.Service", seed: seedOf(deps), aot: false }).macro({
    auth: {
      async resolve({ cookie }) {
        const userId = await Auth.sessionUserId(deps, elysiaCookieJar(cookie));
        if (!userId)
          return status(401, {
            message: "Unauthorized",
          } satisfies AuthModel["unauthorized"]);
        return { user: { id: userId } };
      },
    },
  });
