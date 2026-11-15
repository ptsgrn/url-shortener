import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { err, errAsync, ok, okAsync, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, type InternalError } from "../../utils/error.ts";
import { Audit } from "../audit/service.ts";
import { adminActions } from "../audit/schema.ts";
import { refreshTokens } from "../auth/schema.ts";
import { links } from "../links/schema.ts";
import { withStatus } from "../links/service.ts";
import { UserError } from "../users/model.ts";
import { users } from "../users/schema.ts";
import { AdminError, type AdminModel } from "./model.ts";

/** `column LIKE %q%`, with `%`, `_` and `\` in `q` matched literally. */
const contains = (column: SQLiteColumn, q: string) =>
  sql`${column} LIKE ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} ESCAPE '\\'`;

const roleOf = sql<"user" | "admin">`coalesce(${users.role}, 'user')`;

/**
 * The number of the user's links matching `where` (SQL over alias `l`).
 * Written out by hand: in a single-table select Drizzle prints columns
 * unqualified, which would turn the correlation into `user_id = id`.
 */
const linkCount = (where: string) =>
  sql<number>`(SELECT count(*) FROM links AS l WHERE l.user_id = "users"."id" AND ${sql.raw(where)})`;

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  avatarUrl: users.avatarUrl,
  role: roleOf,
  suspendedAt: users.bannedAt,
  suspendedReason: users.bannedReason,
  createdAt: users.createdAt,
  linkCount: linkCount("l.deleted_at IS NULL"),
};

const withAccountStatus = <T extends { suspendedAt: string | null }>(
  row: T,
) => ({
  ...row,
  status: row.suspendedAt ? ("suspended" as const) : ("active" as const),
});

const notDeleted = isNull(users.deletedAt);

/** The success type of a `ResultAsync`. */
type OkOf<R> = R extends ResultAsync<infer T, unknown> ? T : never;

/** Links read per query when a status filter has to be applied after reading. */
const SCAN_CHUNK = 200;

type Actor = { id: string };

/** Admin oversight of accounts, all links and the audit log (FR-03, FR-15). */
export abstract class Admin {
  /** Accounts, newest first; deleted accounts are left out. */
  static listUsers(
    db: DB,
    { q, role, status, offset = 0, limit = 20 }: AdminModel["usersQuery"],
  ): ResultAsync<AdminModel["user"][], InternalError.Database> {
    return dbQuery(() =>
      db
        .select(userColumns)
        .from(users)
        .where(
          and(
            notDeleted,
            q
              ? or(contains(users.email, q), contains(users.name, q))
              : undefined,
            role ? eq(roleOf, role) : undefined,
            status === "active" ? isNull(users.bannedAt) : undefined,
            status === "suspended" ? isNotNull(users.bannedAt) : undefined,
          ),
        )
        .orderBy(desc(users.createdAt), desc(sql`${users}.rowid`))
        .limit(limit)
        .offset(offset),
    ).map((rows) => rows.map(withAccountStatus));
  }

  static getUser(
    db: DB,
    id: string,
  ): ResultAsync<
    AdminModel["userDetail"],
    UserError.NotFound | InternalError.Database
  > {
    return dbQuery(() =>
      db
        .select({
          ...userColumns,
          linksTotal: linkCount("l.deleted_at IS NULL"),
          linksDisabled: linkCount(
            "l.deleted_at IS NULL AND l.deactivated_at IS NOT NULL",
          ),
          linksBanned: linkCount(
            "l.deleted_at IS NULL AND l.banned_at IS NOT NULL",
          ),
          linksDeleted: linkCount("l.deleted_at IS NOT NULL"),
        })
        .from(users)
        .where(and(eq(users.id, id), notDeleted))
        .get(),
    ).andThen((row) => {
      if (!row) return err(UserError.NotFound);
      const { linksTotal, linksDisabled, linksBanned, linksDeleted, ...user } =
        row;
      return ok({
        ...withAccountStatus(user),
        links: {
          total: linksTotal,
          disabled: linksDisabled,
          banned: linksBanned,
          deleted: linksDeleted,
        },
      });
    });
  }

  /** The target account, for checks before changing it. */
  private static target(db: DB, id: string) {
    return dbQuery(() =>
      db
        .select({ id: users.id, role: roleOf })
        .from(users)
        .where(and(eq(users.id, id), notDeleted))
        .get(),
    ).andThen((user) => (user ? ok(user) : err(UserError.NotFound)));
  }

  /**
   * Suspends account `id` (FR-15): it can no longer use the management API,
   * its links stop redirecting, and every session it has is ended (refresh
   * tokens revoked; access tokens are short-lived and the role check reads
   * the suspension on every request). Its links and codes are kept.
   * Suspending an already suspended account changes and logs nothing.
   */
  static suspend(
    db: DB,
    actor: Actor,
    id: string,
    { reason }: AdminModel["suspendBody"],
  ): ResultAsync<
    AdminModel["userDetail"],
    | UserError.NotFound
    | AdminError.CannotSuspendSelf
    | AdminError.CannotSuspendAdmin
    | InternalError.Database
  > {
    if (id === actor.id) return errAsync(AdminError.CannotSuspendSelf as const);
    return Admin.target(db, id)
      .andThen((user) =>
        user.role === "admin"
          ? err(AdminError.CannotSuspendAdmin as const)
          : ok(user),
      )
      .andThen(() =>
        dbQuery(() =>
          db.batch([
            db
              .update(users)
              .set({
                bannedAt: new Date().toISOString(),
                bannedReason: reason,
                updatedAt: new Date(),
              })
              .where(and(eq(users.id, id), isNull(users.bannedAt))),
            Audit.afterWrite(db, {
              actorId: actor.id,
              action: "user.suspend",
              targetType: "user",
              targetId: id,
              reason,
            }),
            db
              .update(refreshTokens)
              .set({ revokedAt: new Date() })
              .where(
                and(
                  eq(refreshTokens.userId, id),
                  isNull(refreshTokens.revokedAt),
                ),
              ),
          ]),
        ),
      )
      .andThen(() => Admin.getUser(db, id));
  }

  /**
   * Lifts a suspension. Sessions ended by the suspension stay ended, so the
   * user signs in again (FR-15); their links still need to pass their own
   * state and the domain rules to redirect. Restoring an active account
   * changes and logs nothing.
   */
  static restore(
    db: DB,
    actor: Actor,
    id: string,
    reason: string | undefined,
  ): ResultAsync<
    AdminModel["userDetail"],
    UserError.NotFound | InternalError.Database
  > {
    return Admin.target(db, id)
      .andThen(() =>
        dbQuery(() =>
          db.batch([
            db
              .update(users)
              .set({
                bannedAt: null,
                bannedReason: null,
                updatedAt: new Date(),
              })
              .where(and(eq(users.id, id), isNotNull(users.bannedAt))),
            Audit.afterWrite(db, {
              actorId: actor.id,
              action: "user.restore",
              targetType: "user",
              targetId: id,
              reason,
            }),
          ]),
        ),
      )
      .andThen(() => Admin.getUser(db, id));
  }

  /**
   * Every user's links, newest first, with their owner; `offset` and `limit`
   * count links that match every filter, whatever the filter.
   *
   * `status` `banned` and `disabled` filter in the database. `active` and
   * `blocked` depend on the current domain rules, which SQL can't evaluate,
   * so those scan the remaining candidates (neither banned nor disabled)
   * in order, `SCAN_CHUNK` at a time, until `offset + limit` matches are
   * found or the candidates run out.
   */
  static listLinks(
    db: DB,
    {
      q,
      ownerId,
      status,
      deleted = false,
      offset = 0,
      limit = 20,
    }: AdminModel["linksQuery"],
  ): ResultAsync<AdminModel["link"][], InternalError.Database> {
    const read = (from: number, size: number) =>
      dbQuery(() =>
        db
          .select({
            id: links.id,
            code: links.code,
            url: links.url,
            userId: links.userId,
            createdAt: links.createdAt,
            updatedAt: links.updatedAt,
            deletedAt: links.deletedAt,
            deactivatedAt: links.deactivatedAt,
            deactivatedReason: links.deactivatedReason,
            bannedAt: links.bannedAt,
            bannedReason: links.bannedReason,
            ownerId: users.id,
            ownerEmail: users.email,
            ownerName: users.name,
          })
          .from(links)
          .leftJoin(users, eq(users.id, links.userId))
          .where(
            and(
              deleted ? isNotNull(links.deletedAt) : isNull(links.deletedAt),
              q
                ? or(contains(links.code, q), contains(links.url, q))
                : undefined,
              ownerId ? eq(links.userId, ownerId) : undefined,
              status === "banned" ? isNotNull(links.bannedAt) : undefined,
              status === "disabled"
                ? and(isNull(links.bannedAt), isNotNull(links.deactivatedAt))
                : undefined,
              status === "active" || status === "blocked"
                ? and(isNull(links.bannedAt), isNull(links.deactivatedAt))
                : undefined,
            ),
          )
          .orderBy(desc(links.createdAt), desc(sql`${links}.rowid`))
          .limit(size)
          .offset(from),
      ).andThen((rows) => withStatus(db, rows));

    type Row = OkOf<ReturnType<typeof read>>[number];

    /** Matching rows from `from` on, past `skip` matches, up to `limit`. */
    const scan = (
      from: number,
      skip: number,
      found: Row[],
    ): ResultAsync<Row[], InternalError.Database> =>
      read(from, SCAN_CHUNK).andThen((rows) => {
        const matches = rows.filter((row) => row.status === status);
        const skipped = Math.min(skip, matches.length);
        const next = [...found, ...matches.slice(skipped)].slice(0, limit);
        const done = next.length === limit || rows.length < SCAN_CHUNK;
        return done
          ? okAsync(next)
          : scan(from + SCAN_CHUNK, skip - skipped, next);
      });

    const page =
      status === "active" || status === "blocked"
        ? scan(0, offset, [])
        : read(offset, limit);

    return page.map((rows) =>
      rows.map(({ ownerId, ownerEmail, ownerName, ...link }) => ({
        ...link,
        owner: ownerId
          ? { id: ownerId, email: ownerEmail, name: ownerName }
          : null,
      })),
    );
  }

  /** The audit log, newest first. */
  static audit(
    db: DB,
    {
      actorId,
      action,
      targetType,
      targetId,
      offset = 0,
      limit = 20,
    }: AdminModel["auditQuery"],
  ): ResultAsync<AdminModel["auditEntry"][], InternalError.Database> {
    return dbQuery(() =>
      db
        .select({
          id: adminActions.id,
          action: adminActions.action,
          targetType: adminActions.targetType,
          targetId: adminActions.targetId,
          reason: adminActions.reason,
          details: adminActions.details,
          createdAt: adminActions.createdAt,
          actorId: users.id,
          actorEmail: users.email,
          actorName: users.name,
        })
        .from(adminActions)
        .leftJoin(users, eq(users.id, adminActions.actorId))
        .where(
          and(
            actorId ? eq(adminActions.actorId, actorId) : undefined,
            action ? eq(adminActions.action, action) : undefined,
            targetType ? eq(adminActions.targetType, targetType) : undefined,
            targetId ? eq(adminActions.targetId, targetId) : undefined,
          ),
        )
        .orderBy(desc(adminActions.createdAt), desc(sql`${adminActions}.rowid`))
        .limit(limit)
        .offset(offset),
    ).map((rows) =>
      rows.map(({ actorId, actorEmail, actorName, details, ...entry }) => ({
        ...entry,
        details: details ?? null,
        actor: actorId
          ? { id: actorId, email: actorEmail, name: actorName }
          : null,
      })),
    );
  }
}
