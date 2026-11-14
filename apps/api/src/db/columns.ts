import { integer } from "drizzle-orm/sqlite-core";

/** `created_at` timestamp column, defaulting to now. */
export const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());
