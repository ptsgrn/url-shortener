import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export { schema };
export type DB = DrizzleD1Database<typeof schema>;

export const createDb = (d1: Parameters<typeof drizzle>[0]): DB =>
  drizzle(d1, { schema });

/**
 * The D1 binding only exists per request (Cloudflare `env`), so the database
 * is scoped to the request with AsyncLocalStorage. The host (SvelteKit's
 * `handle` hook) wraps each request in `runWithDb`; handlers call `getDb()`.
 */
const storage = new AsyncLocalStorage<DB>();

export const runWithDb = <T>(db: DB, fn: () => T): T => storage.run(db, fn);

export const getDb = (): DB => {
  const db = storage.getStore();
  if (!db) throw new Error("No database bound to this request (see runWithDb)");
  return db;
};
