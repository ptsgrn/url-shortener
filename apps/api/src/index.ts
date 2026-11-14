import { getPlatformProxy } from "wrangler";
import { createApp, type AuthEnv } from "./app.ts";
import { createDb } from "./db/index.ts";
import { mountDevTools } from "./modules/dev/index.ts";

// Standalone dev server: borrows the web app's local D1 database and
// `.dev.vars` secrets through Wrangler, so it shares data with `vite dev`.
const { env } = await getPlatformProxy<
  AuthEnv & { DB: Parameters<typeof createDb>[0] }
>({
  configPath: "../web/wrangler.jsonc",
  persist: { path: "../web/.wrangler/state/v3" },
});

const port = Number(process.env.PORT ?? 3001);

const deps = { db: createDb(env.DB), env };
const app = createApp(deps, { openapi: true });

if (process.env.NODE_ENV !== "production")
  mountDevTools(app, deps, {
    clientIP: (request) => app.server?.requestIP(request)?.address,
  });
app.listen(port);

console.log(`API listening on http://localhost:${port}/api`);
console.log(`OpenAPI docs at http://localhost:${port}/api/openapi`);
