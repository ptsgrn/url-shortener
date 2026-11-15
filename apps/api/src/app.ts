import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { ACCESS_COOKIE } from "./modules/auth/cookie.ts";
import type { Deps } from "./utils/deps.ts";
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
export interface AppOptions {
  /** Serve the OpenAPI UI at `/api/openapi` (spec: `/api/openapi/json`). Dev only. */
  openapi?: boolean;
}

export const createApp = (deps: Deps, options: AppOptions = {}) =>
  new Elysia({ prefix: "/api", aot: false })
    .use(
      openapi({
        enabled: options.openapi ?? false,
        path: "/openapi",
        // Pin the UI bundle (the plugin defaults to `@latest` from jsDelivr).
        scalar: { version: "1.76.4" },
        documentation: {
          info: { title: "URL shortener API", version: "1" },
          tags: [
            { name: "Auth", description: "OAuth sign-in and sessions" },
            { name: "Links", description: "Short links" },
            {
              name: "Rules",
              description: "Domain whitelist and blacklist (admin only)",
            },
            { name: "Stats", description: "Link visit statistics" },
            { name: "Redirect", description: "Opening short links" },
            {
              name: "Admin",
              description: "Accounts, all links and the audit log (admin only)",
            },
          ],
          components: {
            securitySchemes: {
              // Set by signing in (GET /api/v1/auth/{provider}).
              cookieAuth: { type: "apiKey", in: "cookie", name: ACCESS_COOKIE },
            },
          },
        },
      }),
    )
    .get("/health", () => ({ status: "ok" as const }), {
      detail: { summary: "Health check" },
    })
    .group("/v1", (app) => app.use(v1(deps)));

export type App = ReturnType<typeof createApp>;
