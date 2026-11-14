import { defineConfig } from "drizzle-kit";

// Generates SQL migrations that Wrangler applies to D1
// (apps/web/wrangler.jsonc points `migrations_dir` here).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
