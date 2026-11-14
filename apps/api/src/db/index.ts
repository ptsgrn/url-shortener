import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export { schema };
export type DB = DrizzleD1Database<typeof schema>;

export const createDb = (d1: Parameters<typeof drizzle>[0]): DB =>
  drizzle(d1, { schema });
