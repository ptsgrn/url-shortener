import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "../../db/columns.ts";

export const users = sqliteTable("users", {
  id: id(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  role: text("role")
    .$type<"user" | "admin">()
    .$default(() => "user"),
  bannedAt: text("banned_at").$type<string | null>(),
  bannedReason: text("banned_reason").$type<string | null>(),
  ...timestamps(),
});
