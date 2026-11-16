import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id } from "../../db/columns.ts";
import { users } from "../users/schema.ts";

/** What an admin did. */
export type AuditAction =
  | "user.suspend"
  | "user.restore"
  | "link.update"
  | "link.ban"
  | "link.unban"
  | "rule.create"
  | "rule.update"
  | "rule.delete";

export type AuditTarget = "user" | "link" | "rule";

/**
 * Admin actions, append-only: who did what to which user, link or rule,
 * when, and why (FR-15). Written in the same batch as the change itself, so
 * there is never a change without its entry or an entry without its change.
 */
export const adminActions = sqliteTable(
  "admin_actions",
  {
    id: id(),
    /** The admin; `null` once their account is removed. */
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").$type<AuditAction>().notNull(),
    targetType: text("target_type").$type<AuditTarget>().notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason"),
    /** Changed fields as `{ field: { from, to } }`, or what was created/deleted. */
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("admin_actions_target_idx").on(t.targetType, t.targetId),
    index("admin_actions_created_idx").on(t.createdAt),
  ],
);
