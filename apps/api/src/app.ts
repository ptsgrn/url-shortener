import { Elysia } from "elysia";
import type { Deps } from "./utils/deps.ts";
import { statusErrors } from "./utils/error.ts";
import { v1 } from "./v1/index.ts";

export type { AuthEnv, Deps } from "./utils/deps.ts";

/**
 * Builds the Elysia app with its dependencies (database, secrets) injected.
 * It is runtime-agnostic (only uses `app.handle`), so it can be:
 *  - served standalone by Bun (see `index.ts`), or
 *  - mounted inside SvelteKit (see `apps/web/src/lib/server/app.ts`).
 *
 * Every route lives under `/api` so both setups expose the same URLs.
 * Versioned routes live under `/api/v{n}` (see `./v1`); `/api/health` is unversioned.
 *
 * `aot: false`: Cloudflare Workers forbids `new Function`, which Elysia's
 * ahead-of-time compiler relies on.
 */
export const createApp = (deps: Deps) =>
  new Elysia({ prefix: "/api", aot: false })
    .use(statusErrors)
    .get("/health", () => ({ status: "ok" as const }))
    .group("/v1", (app) => app.use(v1(deps)));

export type App = ReturnType<typeof createApp>;
