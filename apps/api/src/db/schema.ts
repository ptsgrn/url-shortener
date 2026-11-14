// Aggregates every domain's tables: used by drizzle-kit (see drizzle.config.ts)
// and by `createDb` for the relational query API (`db.query.*`).
export * from "../modules/users/schema.ts";
export * from "../modules/auth/schema.ts";
export * from "../modules/links/schema.ts";
export * from "../modules/rules/schema.ts";
