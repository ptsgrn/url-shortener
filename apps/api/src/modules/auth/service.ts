import { generateCodeVerifier, generateState } from "arctic";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import {
  err,
  errAsync,
  ok,
  ResultAsync,
  safeTry,
  type Result,
} from "neverthrow";
import type { Deps } from "../../utils/deps.ts";
import {
  dbQuery,
  InternalError,
  InternalErrorStatus,
} from "../../utils/error.ts";
import type { UserError, UserModel } from "../users/model.ts";
import { User, type Role } from "../users/service.ts";
import {
  ACCESS_COOKIE,
  cookieOptions,
  elysiaCookieJar,
  REFRESH_COOKIE,
  type CookieJar,
} from "./cookie.ts";
import {
  AuthError,
  AuthErrorStatus,
  type AuthModel,
  type RefreshError,
} from "./model.ts";
import { providers, type OAuthProvider } from "./providers/index.ts";
import { accounts } from "./schema.ts";
import { Token } from "./token.ts";
import { emailAllowed, parseDomains } from "./policy.ts";

export type SessionUser = UserModel["user"];

const ROLE_RANK = { user: 0, admin: 1 } as const satisfies Record<Role, number>;

const OAUTH_COOKIES = ["oauth_state", "oauth_verifier", "oauth_redirect"];

const isInternal = (e: string): e is InternalError =>
  (Object.values(InternalError) as string[]).includes(e);

/** Only allow same-origin relative paths as post-login redirects. */
const safeRedirect = (value: unknown) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";

const getProvider = (
  deps: Deps,
  name: string,
  origin: string,
): Result<OAuthProvider, AuthError.UnknownProvider> => {
  const create = providers[name];
  return create
    ? ok(create(deps.env, `${origin}/api/v1/auth/${name}/callback`))
    : err(AuthError.UnknownProvider);
};

/**
 * Sessions: an access token (short-lived JWT) plus a refresh token (opaque,
 * stored in D1), both in httpOnly cookies. Takes a `CookieJar` instead of
 * Elysia's context, so SvelteKit's `event.cookies` works too.
 */
export abstract class Auth {
  private static setTokens(
    { env }: Deps,
    jar: CookieJar,
    secure: boolean,
    userId: string,
    refreshToken: string,
  ): ResultAsync<void, InternalError.Crypto> {
    return Token.signAccess(env.JWT_SECRET, userId).map((accessToken) => {
      const opts = cookieOptions(secure);
      jar.set(ACCESS_COOKIE, accessToken, opts.access);
      jar.set(REFRESH_COOKIE, refreshToken, opts.refresh);
    });
  }

  private static clearTokens(jar: CookieJar, secure: boolean) {
    const opts = cookieOptions(secure);
    jar.delete(ACCESS_COOKIE, { path: opts.access.path });
    jar.delete(REFRESH_COOKIE, { path: opts.refresh.path });
  }

  static startSession(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
    userId: string,
  ): ResultAsync<void, InternalError> {
    return Token.issueRefresh(deps.db, userId).andThen(({ token }) =>
      Auth.setTokens(deps, jar, secure, userId, token),
    );
  }

  /**
   * Rotates the refresh token and resolves to the user id. On an auth error
   * the cookies are cleared; on an internal error they are left alone.
   */
  static refreshSession(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
  ): ResultAsync<string, RefreshError | InternalError> {
    return Token.rotateRefresh(deps.db, jar.get(REFRESH_COOKIE))
      .orTee((e) => {
        if (!isInternal(e)) Auth.clearTokens(jar, secure);
      })
      .andThen(({ userId, refreshToken }) =>
        Auth.setTokens(deps, jar, secure, userId, refreshToken).map(
          () => userId,
        ),
      );
  }

  /** Revokes the refresh token and clears the cookies (even if revoking fails). */
  static endSession(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
  ): ResultAsync<void, InternalError> {
    const refreshToken = jar.get(REFRESH_COOKIE);
    Auth.clearTokens(jar, secure);
    return Token.revokeRefresh(deps.db, refreshToken);
  }

  /** The user id from the access token alone (no refresh). */
  static sessionUserId(
    { env }: Deps,
    jar: CookieJar,
  ): ResultAsync<string, AuthError.Unauthorized> {
    return Token.verifyAccess(env.JWT_SECRET, jar.get(ACCESS_COOKIE));
  }

  /** The signed-in user, refreshing the session if the access token expired. */
  static sessionUser(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
  ): ResultAsync<
    SessionUser,
    AuthError.Unauthorized | RefreshError | UserError.NotFound | InternalError
  > {
    return Auth.sessionUserId(deps, jar)
      .orElse((e) =>
        jar.get(REFRESH_COOKIE)
          ? Auth.refreshSession(deps, jar, secure)
          : errAsync(e),
      )
      .andThen((userId) => User.findById(deps.db, userId));
  }

  /** Starts an OAuth sign-in: stores state + PKCE verifier, returns the provider URL. */
  static authorizationURL(
    deps: Deps,
    providerName: string,
    { redirectTo }: AuthModel["signInQuery"],
    origin: string,
    jar: CookieJar,
    secure: boolean,
  ): Result<string, AuthError.UnknownProvider> {
    return getProvider(deps, providerName, origin).map((provider) => {
      const opts = cookieOptions(secure).oauth;
      const state = generateState();
      const verifier = generateCodeVerifier();
      jar.set("oauth_state", state, opts);
      jar.set("oauth_verifier", verifier, opts);
      jar.set("oauth_redirect", safeRedirect(redirectTo), opts);
      return provider.createAuthorizationURL(state, verifier).toString();
    });
  }

  /** Completes an OAuth sign-in and starts a session; resolves to where to redirect. */
  static completeSignIn(
    deps: Deps,
    providerName: string,
    { code, state }: AuthModel["callbackQuery"],
    origin: string,
    jar: CookieJar,
    secure: boolean,
  ): ResultAsync<
    string,
    | AuthError.UnknownProvider
    | AuthError.InvalidOAuthState
    | AuthError.OAuthExchangeFailed
    | AuthError.EmailNotAllowed
    | AuthError.AccountSuspended
    | AuthError.AccountUnavailable
    | InternalError
  > {
    return safeTry(async function* () {
      const provider = yield* getProvider(deps, providerName, origin);

      const expectedState = jar.get("oauth_state");
      const verifier = jar.get("oauth_verifier");
      const redirectTo = safeRedirect(jar.get("oauth_redirect"));
      const { path } = cookieOptions(secure).oauth;
      for (const name of OAUTH_COOKIES) jar.delete(name, { path });

      if (!code || !verifier || !expectedState || state !== expectedState)
        return err(AuthError.InvalidOAuthState);

      const profile = yield* ResultAsync.fromThrowable(
        () => provider.getProfile(code, verifier),
        () => AuthError.OAuthExchangeFailed as const,
      )();
      // FR-01: checked before any account is created for the visitor.
      if (!emailAllowed(profile, parseDomains(deps.env.ALLOWED_EMAIL_DOMAINS)))
        return err(AuthError.EmailNotAllowed);
      const userId = yield* Auth.upsertOAuthUser(deps, providerName, profile);
      // A suspended or deleted account gets no session at all.
      yield* Auth.mayStartSession(deps, userId);
      yield* Auth.startSession(deps, jar, secure, userId);
      return ok(redirectTo);
    });
  }

  /** Refuses sign-in to suspended (FR-15) and deleted accounts. */
  private static mayStartSession(
    { db }: Deps,
    userId: string,
  ): ResultAsync<
    void,
    AuthError.AccountSuspended | AuthError.AccountUnavailable | InternalError
  > {
    return User.access(db, userId)
      .mapErr((e) => (isInternal(e) ? e : AuthError.AccountUnavailable))
      .andThen(({ banned }) =>
        banned ? err(AuthError.AccountSuspended) : ok(undefined),
      );
  }

  /** Finds the user linked to this provider account, creating one if needed. */
  private static upsertOAuthUser(
    { db }: Deps,
    provider: string,
    { id, ...profile }: Awaited<ReturnType<OAuthProvider["getProfile"]>>,
  ): ResultAsync<string, InternalError.Database> {
    return safeTry(async function* () {
      const account = yield* dbQuery(() =>
        db.query.accounts.findFirst({
          where: and(
            eq(accounts.provider, provider),
            eq(accounts.providerAccountId, id),
          ),
        }),
      );
      if (account) {
        yield* User.updateProfile(db, account.userId, profile);
        return ok(account.userId);
      }
      const userId = yield* User.create(db, profile);
      yield* dbQuery(() =>
        db.insert(accounts).values({ provider, providerAccountId: id, userId }),
      );
      return ok(userId);
    });
  }
}

// Elysia dedupes named plugins by `name` + JSON of `seed`; `deps` itself is not
// serializable (the D1 client is circular), so seed with a stable id per `deps`.
const seeds = new WeakMap<Deps, number>();
let nextSeed = 0;
const seedOf = (deps: Deps) => {
  if (!seeds.has(deps)) seeds.set(deps, ++nextSeed);
  return seeds.get(deps)!;
};

/**
 * Request-dependent auth service: adds an `auth: true` route option that
 * requires a valid access token cookie and resolves `user`.
 */
export const authService = (deps: Deps) =>
  new Elysia({ name: "Auth.Service", seed: seedOf(deps), aot: false }).macro({
    auth: {
      detail: { security: [{ cookieAuth: [] }] },
      resolve: ({ cookie, status }) =>
        Auth.sessionUserId(deps, elysiaCookieJar(cookie)).match(
          (id) => ({ user: { id } }),
          (error) => status(AuthErrorStatus[error], { error }),
        ),
    },
    /**
     * `guardRole: "user" | "admin"`: like `auth: true`, but also requires the
     * user to hold at least that role (admin outranks user) and not be
     * banned. Resolves `user` with its `role`.
     */
    guardRole: (required: Role) => ({
      detail: { security: [{ cookieAuth: [] }] },
      resolve: ({ cookie, status }) =>
        Auth.sessionUserId(deps, elysiaCookieJar(cookie))
          .andThen((id) =>
            User.access(deps.db, id)
              // A valid token for a user that no longer exists.
              .mapErr((e) =>
                isInternal(e) ? e : (AuthError.Unauthorized as const),
              )
              .andThen(({ role, banned }) =>
                !banned && ROLE_RANK[role] >= ROLE_RANK[required]
                  ? ok({ id, role })
                  : err(AuthError.Forbidden as const),
              ),
          )
          .match(
            (user) => ({ user }),
            (error) =>
              isInternal(error)
                ? status(InternalErrorStatus[error], { error })
                : status(AuthErrorStatus[error], { error }),
          ),
    }),
  });
