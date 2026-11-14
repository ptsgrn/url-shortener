import { Elysia } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import {
  failWith,
  internalErrorBody,
  InternalErrorStatus,
} from "../../utils/error.ts";
import { err } from "neverthrow";
import { UserError, UserModel } from "../users/model.ts";
import { User } from "../users/service.ts";
import { elysiaCookieJar, isSecure } from "./cookie.ts";
import { AuthError, AuthErrorStatus, AuthModel } from "./model.ts";
import { Auth, authService } from "./service.ts";

const origin = (request: Request) => new URL(request.url).origin;

const fail = failWith({ ...AuthErrorStatus, ...InternalErrorStatus });

const ok = () => ({ ok: true as const });

// Responses that set cookies return `{ ok: true }`, not 204: Elysia attaches
// a body when cookies are set, and a 204 with a body throws.

/** OAuth sign-in and session management, at `/auth`. */
export const auth = (deps: Deps) =>
  new Elysia({ prefix: "/auth", aot: false })
    .use(authService(deps))
    .post(
      "/refresh",
      ({ cookie, request, status }) =>
        Auth.refreshSession(
          deps,
          elysiaCookieJar(cookie),
          isSecure(request),
        ).match(ok, fail(status)),
      {
        response: {
          200: AuthModel.ok,
          401: AuthModel.refreshFailed,
          500: internalErrorBody,
        },
      },
    )
    .post(
      "/logout",
      ({ cookie, request, status }) =>
        Auth.endSession(deps, elysiaCookieJar(cookie), isSecure(request)).match(
          ok,
          fail(status),
        ),
      { response: { 200: AuthModel.ok, 500: internalErrorBody } },
    )
    .get(
      "/me",
      ({ user, status }) =>
        User.findById(deps.db, user.id)
          // A valid token for a deleted user is as good as no session.
          .orElse((e) =>
            err(e === UserError.NotFound ? AuthError.Unauthorized : e),
          )
          .match((u) => u, fail(status)),
      {
        auth: true,
        response: {
          200: UserModel.user,
          401: AuthModel.unauthorized,
          500: internalErrorBody,
        },
      },
    )
    .get(
      "/:provider",
      ({ params, query, cookie, request, redirect, status }) =>
        Auth.authorizationURL(
          deps,
          params.provider,
          query,
          origin(request),
          elysiaCookieJar(cookie),
          isSecure(request),
        ).match((url) => redirect(url, 302), fail(status)),
      {
        params: AuthModel.providerParams,
        query: AuthModel.signInQuery,
        response: { 404: AuthModel.unknownProvider },
      },
    )
    .get(
      "/:provider/callback",
      ({ params, query, cookie, request, redirect, status }) =>
        Auth.completeSignIn(
          deps,
          params.provider,
          query,
          origin(request),
          elysiaCookieJar(cookie),
          isSecure(request),
        ).match((to) => redirect(to, 302), fail(status)),
      {
        params: AuthModel.providerParams,
        query: AuthModel.callbackQuery,
        response: {
          400: AuthModel.signInFailed,
          404: AuthModel.unknownProvider,
          500: internalErrorBody,
        },
      },
    );
