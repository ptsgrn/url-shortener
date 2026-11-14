import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt } from "../../db/columns.ts";
import { users } from "../users/schema.ts";

export const links = sqliteTable("links", {
  code: text("code").primaryKey(),
  url: text("url").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});
