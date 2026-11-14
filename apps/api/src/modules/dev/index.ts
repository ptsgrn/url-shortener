import { Elysia } from "elysia";
import type { App } from "../../app.ts";
import type { Deps } from "../../utils/deps.ts";
import {
  failWith,
  internalErrorBody,
  InternalErrorStatus,
} from "../../utils/error.ts";
import { elysiaCookieJar, isSecure } from "../auth/cookie.ts";
import { UserErrorStatus } from "../users/model.ts";
import { devToolsEnabled, isLocalRequest } from "./guard.ts";
import { DevError, DevErrorStatus, DevModel } from "./model.ts";
import { Dev } from "./service.ts";

const fail = failWith({
  ...DevErrorStatus,
  ...UserErrorStatus,
  ...InternalErrorStatus,
});

/** Dev-only helpers for local testing, at `/dev`. Never mount in production. */
const devTools = (deps: Deps, options: DevToolsOptions) =>
  new Elysia({ prefix: "/dev", aot: false, detail: { tags: ["Dev"] } })
    // Gate 3: re-checked on every request (local hook: this plugin only).
    .onBeforeHandle(({ request, status }) => {
      // A host that can tell the peer address must; unknown then means deny.
      const ip = options.clientIP && (options.clientIP(request) ?? "");
      if (!devToolsEnabled(deps.env) || !isLocalRequest(request, ip))
        return status(DevErrorStatus[DevError.Disabled], {
          error: DevError.Disabled,
        });
    })
    .get(
      "/users",
      ({ status }) => Dev.listUsers(deps).match((u) => u, fail(status)),
      {
        detail: { summary: "List users you can sign in as" },
        response: {
          200: DevModel.users,
          404: DevModel.disabled,
          500: internalErrorBody,
        },
      },
    )
    .post(
      "/users",
      ({ body, cookie, request, status }) =>
        Dev.createAndLogin(
          deps,
          elysiaCookieJar(cookie),
          isSecure(request),
          body,
        ).match((u) => u, fail(status)),
      {
        detail: { summary: "Create a user (or admin) and sign in as them" },
        body: DevModel.createBody,
        response: {
          200: DevModel.user,
          404: DevModel.disabled,
          500: internalErrorBody,
        },
      },
    )
    .post(
      "/users/:id/login",
      ({ params, cookie, request, status }) =>
        Dev.loginAs(
          deps,
          elysiaCookieJar(cookie),
          isSecure(request),
          params.id,
        ).match((u) => u, fail(status)),
      {
        detail: { summary: "Sign in as any user without OAuth" },
        params: DevModel.userParams,
        response: {
          200: DevModel.user,
          404: DevModel.loginFailed,
          500: internalErrorBody,
        },
      },
    );

export interface DevToolsOptions {
  /**
   * The peer IP of a request, for hosts that know it (Bun: `app.server.requestIP`).
   * Elysia's context `server` is `null` with `aot: false`, so the host passes it.
   */
  clientIP?: (request: Request) => string | undefined;
}

/**
 * Adds the dev tools (at `/api/dev`) to `app` when `DEV_TOOLS=true` (gate 2).
 * Call it only from a development host (gate 1). They are left out of the
 * `App` type, so the typed client never sees them.
 */
export const mountDevTools = (
  app: App,
  deps: Deps,
  options: DevToolsOptions = {},
): App => {
  if (!devToolsEnabled(deps.env)) return app;
  console.warn(
    "[dev] Dev tools enabled at /api/dev: anyone on localhost can sign in as any user.",
  );
  app.use(devTools(deps, options));
  return app;
};
