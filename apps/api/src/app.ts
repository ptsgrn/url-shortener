import { Elysia } from "elysia";
import { v1 } from "./v1/index.ts";

/**
 * The Elysia app. It is runtime-agnostic (only uses `app.handle`), so it can be:
 *  - served standalone by Bun (see `index.ts`), or
 *  - mounted inside SvelteKit (see `apps/web/src/routes/api/[...slugs]/+server.ts`).
 *
 * Every route lives under `/api` so both setups expose the same URLs.
 * Versioned routes live under `/api/v{n}` (see `./v1`); `/api/health` is unversioned.
 *
 * `aot: false`: Cloudflare Workers forbids `new Function`, which Elysia's
 * ahead-of-time compiler relies on.
 *
 * Database routes need a D1 binding, so they only work when mounted in
 * SvelteKit on Workers (or `vite dev`, which emulates the binding).
 */
export const app = new Elysia({ prefix: "/api", aot: false })
  .get("/health", () => ({ status: "ok" as const }))
  .group("/v1", (app) => app.use(v1));

export type App = typeof app;
