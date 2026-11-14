import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id } from "../../db/columns.ts";

export const users = sqliteTable("users", {
  id: id(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});
