import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt } from "../../db/columns.ts";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});
