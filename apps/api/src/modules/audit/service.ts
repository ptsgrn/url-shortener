import { sql } from "drizzle-orm";
import type { DB } from "../../db/index.ts";
import { adminActions, type AuditAction, type AuditTarget } from "./schema.ts";

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: AuditTarget;
  targetId: string;
  reason?: string | null;
  details?: Record<string, unknown>;
}

/** `{ field: { from, to } }` for each field whose value changes. */
export const changes = <T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> =>
  Object.fromEntries(
    Object.entries(after)
      .filter(([key, to]) => to !== undefined && to !== before[key])
      .map(([key, to]) => [key, { from: before[key], to }]),
  );

export abstract class Audit {
  /**
   * Records an admin action, for use in a `db.batch([...])` directly after
   * the write it describes:
   *
   *     db.batch([write, Audit.afterWrite(db, entry), ...])
   *
   * It inserts only if that write changed at least one row (SQLite's
   * `changes()`), so a no-op (a duplicate skipped by `ON CONFLICT DO
   * NOTHING`, suspending an already suspended user, a row that vanished) is
   * not logged, and because a batch is one transaction, a failed write takes
   * its entry with it.
   */
  static afterWrite(
    db: DB,
    { actorId, action, targetType, targetId, reason, details }: AuditEntry,
  ) {
    // Columns in table order: `INSERT … SELECT` takes values by position.
    return db.insert(adminActions).select(sql`
      SELECT ${crypto.randomUUID()}, ${actorId}, ${action}, ${targetType},
        ${targetId}, ${reason ?? null},
        ${details === undefined ? null : JSON.stringify(details)},
        ${Math.floor(Date.now() / 1000)}
      WHERE changes() > 0`);
  }
}
