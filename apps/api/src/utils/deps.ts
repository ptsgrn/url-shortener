import type { DB } from "../db/index.ts";

/** Secrets and config the API needs; provided by the host (Cloudflare `env`). */
export interface AuthEnv {
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

/** Everything the app depends on, injected through `createApp(deps)`. */
export interface Deps {
  db: DB;
  env: AuthEnv;
}
