import { Elysia } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import { User } from "../users/service.ts";
import { UserModel } from "../users/model.ts";
import { elysiaCookieJar, isSecure } from "./cookie.ts";
import { AuthModel } from "./model.ts";
import { Auth, authService } from "./service.ts";

const origin = (request: Request) => new URL(request.url).origin;

// Responses that set cookies return `{ ok: true }`, not 204: Elysia attaches
// a body when cookies are set, and a 204 with a body throws.

/** OAuth sign-in and session management, at `/auth`. */
export const auth = (deps: Deps) =>
  new Elysia({ prefix: "/auth", aot: false })
  .use(authService(deps))
  .post(
    "/refresh",
    async ({ cookie, request, status }) =>
      (await Auth.refreshSession(deps, elysiaCookieJar(cookie), isSecure(request)))
        ? { ok: true as const }
        : status(401, { message: "Invalid refresh token" as const }),
    {
      response: { 200: AuthModel.ok, 401: AuthModel.invalidRefreshToken },
    },
  )
  .post(
    "/logout",
    async ({ cookie, request }) => {
      await Auth.endSession(deps, elysiaCookieJar(cookie), isSecure(request));
      return { ok: true as const };
    },
    { response: { 200: AuthModel.ok } },
  )
  .get(
    "/me",
    async ({ user, status }) =>
      (await User.findById(deps.db, user.id)) ??
      status(401, { message: "Unauthorized" as const }),
    {
      auth: true,
      response: { 200: UserModel.user, 401: AuthModel.unauthorized },
    },
  )
  .get(
    "/:provider",
    ({ params, query, cookie, request, redirect }) =>
      redirect(
        Auth.authorizationURL(
          deps,
          params.provider,
          query,
          origin(request),
          elysiaCookieJar(cookie),
          isSecure(request),
        ),
        302,
      ),
    {
      params: AuthModel.providerParams,
      query: AuthModel.signInQuery,
      response: { 404: AuthModel.unknownProvider },
    },
  )
  .get(
    "/:provider/callback",
    async ({ params, query, cookie, request, redirect }) =>
      redirect(
        await Auth.completeSignIn(
          deps,
          params.provider,
          query,
          origin(request),
          elysiaCookieJar(cookie),
          isSecure(request),
        ),
        302,
      ),
    {
      params: AuthModel.providerParams,
      query: AuthModel.callbackQuery,
      response: {
        400: AuthModel.signInFailed,
        404: AuthModel.unknownProvider,
      },
    },
  );
