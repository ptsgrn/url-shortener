import { integer, text } from "drizzle-orm/sqlite-core";

/** `created_at` timestamp column, defaulting to now. */
export const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());

export const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());

export const deletedAt = () =>
  integer("deleted_at", { mode: "timestamp" })
    .$type<number | null>()
    .$default(() => null);

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
