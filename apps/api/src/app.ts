import { Elysia, t } from "elysia";

/**
 * The Elysia app. It is runtime-agnostic (only uses `app.handle`), so it can be:
 *  - served standalone by Bun (see `index.ts`), or
 *  - mounted inside SvelteKit (see `apps/web/src/routes/api/[...slugs]/+server.ts`).
 *
 * Every route lives under `/api` so both setups expose the same URLs.
 */
export const app = new Elysia({ prefix: "/api" })
  .get("/health", () => ({ status: "ok" as const }))
  .post(
    "/links",
    ({ body }) => {
      // TODO: persist and generate a real short code
      const code = Math.random().toString(36).slice(2, 8);
      return { code, url: body.url };
    },
    {
      body: t.Object({
        url: t.String({ format: "uri" }),
      }),
    },
  );

export type App = typeof app;
