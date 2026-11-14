import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "drizzle-kit";

// The local D1 database that `vite dev` / `wrangler d1 migrations apply --local`
// use (Miniflare names the file after a hash, next to its `metadata.sqlite`).
const D1_DIR = "../web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";

const localD1 = () => {
  const file =
    existsSync(D1_DIR) &&
    readdirSync(D1_DIR).find(
      (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
    );
  if (!file)
    throw new Error(
      `No local D1 database in ${D1_DIR}. Run \`bun run db:migrate\` in apps/web first.`,
    );
  return `file:${join(D1_DIR, file)}`;
};

const needsDb = process.argv.some((arg) => arg === "studio");

// Generates SQL migrations that Wrangler applies to D1
// (apps/web/wrangler.jsonc points `migrations_dir` here). `drizzle-kit studio`
// opens the local D1 database; `generate` needs no database.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(needsDb && { dbCredentials: { url: localD1() } }),
});
