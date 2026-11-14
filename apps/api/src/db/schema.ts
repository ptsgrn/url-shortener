import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const links = sqliteTable("links", {
  code: text("code").primaryKey(),
  url: text("url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
