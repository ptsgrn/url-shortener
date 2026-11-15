import { ResultAsync } from "neverthrow";
import type { DB } from "../db/index.ts";

/** Secrets and config the API needs; provided by the host (Cloudflare `env`). */
export interface AuthEnv {
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  DEV_TOOLS?: string;
}

/** Everything the app depends on, injected through `createApp(deps)`. */
export interface Deps {
  db: DB;
  env: AuthEnv;
  /**
   * Keeps `task` running after the response for `request` is sent: on
   * Workers, the request's `ctx.waitUntil`. The app is built once per
   * isolate but `ctx` is per request, so the host looks it up by `request`
   * (see `apps/web/src/lib/server/app.ts`). Omitted (Bun, tests): background
   * work is awaited before responding instead.
   */
  waitUntil?: (request: Request, task: Promise<unknown>) => void;
}

/**
 * Runs `task` after the response when the host supports it (see
 * `Deps.waitUntil`), otherwise waits for it. `task` can't fail (`never`):
 * log and swallow its errors first, since nobody is left to handle them.
 */
export const inBackground = (
  deps: Deps,
  request: Request,
  task: ResultAsync<unknown, never>,
): ResultAsync<void, never> => {
  const done = (async () => {
    await task;
  })();
  if (!deps.waitUntil) return ResultAsync.fromSafePromise(done);
  deps.waitUntil(request, done);
  return ResultAsync.fromSafePromise(Promise.resolve());
};
