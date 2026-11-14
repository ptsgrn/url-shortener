import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id } from "../../db/columns.ts";
import { users } from "../users/schema.ts";

export const links = sqliteTable("links", {
  id: id(),
  code: text("code").notNull().unique(),
  url: text("url").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});
