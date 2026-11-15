import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { err, errAsync, ok, okAsync, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, InternalError } from "../../utils/error.ts";
import { Audit, changes } from "../audit/service.ts";
import { Rule } from "../rules/service.ts";
import { LinkError, type LinkModel } from "./model.ts";
import { randomCode } from "./random.ts";
import { isReservedCode } from "./reserved.ts";
import type { Role } from "../users/service.ts";
import { users } from "../users/schema.ts";
import { links } from "./schema.ts";

/** How many fresh codes to try before giving up on a create. */
const MAX_CODE_ATTEMPTS = 5;

/** Soft-deleted links are gone for every reader. */
const notDeleted = isNull(links.deletedAt);
const byCode = (code: string) => and(eq(links.code, code), notDeleted);

const statusColumns = {
  deactivatedAt: true,
  deactivatedReason: true,
  bannedAt: true,
  bannedReason: true,
} as const;

const publicColumns = { code: true, url: true, ...statusColumns } as const;

/**
 * Adds `blocked` (destination domain is blacklisted under the current rules)
 * to each row. Blocked links stop redirecting but keep their code.
 */
const withBlocked = <T extends { url: string }>(
  db: DB,
  rows: T[],
): ResultAsync<(T & { blocked: boolean })[], InternalError.Database> => {
  const hosts = rows.map((row) => Rule.hostOf(row.url));
  return Rule.verdicts(
    db,
    hosts.filter((h): h is string => h !== undefined),
  ).map((verdicts) =>
    rows.map((row, i) => {
      const host = hosts[i];
      return {
        ...row,
        blocked: host === undefined || verdicts.get(host) !== "allowed",
      };
    }),
  );
};

type Status = LinkModel["ownedLink"]["status"];

const statusOf = (link: {
  bannedAt: Date | null;
  deactivatedAt: Date | null;
  blocked: boolean;
}): Status =>
  link.bannedAt
    ? "banned"
    : link.deactivatedAt
      ? "disabled"
      : link.blocked
        ? "blocked"
        : "active";

/** `withBlocked` plus the combined `status` (see `LinkModel`). */
export const withStatus = <
  T extends { url: string; bannedAt: Date | null; deactivatedAt: Date | null },
>(
  db: DB,
  rows: T[],
): ResultAsync<
  (T & { blocked: boolean; status: Status })[],
  InternalError.Database
> =>
  withBlocked(db, rows).map((rows) =>
    rows.map((row) => ({ ...row, status: statusOf(row) })),
  );

const ownedColumns = {
  id: true,
  code: true,
  url: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  ...statusColumns,
} as const;

/** Who is updating a link: owners manage their own links, admins any link. */
export interface Actor {
  id: string;
  role: Role;
}

export abstract class Link {
  /**
   * Creates a link to `url` with the chosen `code`, or a random one. A random
   * code that's taken is redrawn; a chosen one that's taken (by any link,
   * even a deleted one) or reserved is `CodeTaken`. The code's uniqueness is
   * enforced by the database, so of concurrent creates with one code exactly
   * one wins. A refused destination reserves nothing.
   */
  static create(
    db: DB,
    { url, code }: LinkModel["createBody"],
    userId: string,
  ): ResultAsync<
    LinkModel["link"],
    LinkError.Blocked | LinkError.CodeTaken | InternalError.Database
  > {
    if (code !== undefined && isReservedCode(code))
      return errAsync(LinkError.CodeTaken as const);

    // Insert; on a `code` unique conflict nothing is inserted (no row returned).
    const insert = (candidate: string) =>
      dbQuery(() =>
        db
          .insert(links)
          .values({ code: candidate, url, userId })
          .onConflictDoNothing({ target: links.code })
          .returning({
            code: links.code,
            url: links.url,
            deactivatedAt: links.deactivatedAt,
            deactivatedReason: links.deactivatedReason,
            bannedAt: links.bannedAt,
            bannedReason: links.bannedReason,
          })
          .get(),
      ).map((link) => link && { ...link, blocked: false });

    const random = (
      left: number,
    ): ResultAsync<LinkModel["link"], InternalError.Database> =>
      insert(randomCode()).andThen((link) => {
        if (link) return okAsync(link);
        if (left > 1) return random(left - 1);
        console.error(
          `[${InternalError.Database}] no free link code after ${MAX_CODE_ATTEMPTS} attempts`,
        );
        return errAsync(InternalError.Database as const);
      });

    const chosen = (code: string) =>
      insert(code).andThen((link) =>
        link ? ok(link) : err(LinkError.CodeTaken as const),
      );

    return Rule.check(db, url).andThen((verdict) =>
      verdict !== "allowed"
        ? errAsync(LinkError.Blocked as const)
        : code === undefined
          ? random(MAX_CODE_ATTEMPTS)
          : chosen(code),
    );
  }

  /**
   * Where `code` should redirect right now (FR-09): it exists, isn't deleted,
   * disabled or suspended, its owner isn't suspended, and its destination
   * passes the current domain rules (FR-04). Otherwise, why not.
   */
  static resolve(
    db: DB,
    code: string,
  ): ResultAsync<
    { id: string; url: string },
    | LinkError.NotFound
    | LinkError.Disabled
    | LinkError.Banned
    | LinkError.Blocked
    | InternalError.Database
  > {
    return dbQuery(() =>
      db
        .select({
          id: links.id,
          url: links.url,
          deactivatedAt: links.deactivatedAt,
          bannedAt: links.bannedAt,
          ownerBannedAt: users.bannedAt,
        })
        .from(links)
        .leftJoin(users, eq(users.id, links.userId))
        .where(byCode(code))
        .get(),
    )
      .andThen((link) => {
        if (!link) return err(LinkError.NotFound);
        if (link.bannedAt || link.ownerBannedAt) return err(LinkError.Banned);
        if (link.deactivatedAt) return err(LinkError.Disabled);
        return ok({ id: link.id, url: link.url });
      })
      .andThen((link) =>
        Rule.check(db, link.url).andThen((verdict) =>
          verdict === "allowed" ? ok(link) : err(LinkError.Blocked),
        ),
      );
  }

  static find(
    db: DB,
    code: string,
  ): ResultAsync<
    LinkModel["link"],
    LinkError.NotFound | InternalError.Database
  > {
    return dbQuery(() =>
      db.query.links.findFirst({
        where: byCode(code),
        columns: publicColumns,
      }),
    )
      .andThen((link) => (link ? ok(link) : err(LinkError.NotFound)))
      .andThen((link) => withBlocked(db, [link]).map(([row]) => row!));
  }

  static get(
    db: DB,
    code: string,
  ): ResultAsync<LinkModel["link"], InternalError.Database> {
    return dbQuery(() =>
      db.query.links.findFirst({
        where: byCode(code),
        columns: publicColumns,
      }),
    )
      .andThen((link) => withBlocked(db, [link!]))
      .map(([row]) => row!);
  }

  static getId(
    db: DB,
    code: string,
  ): ResultAsync<LinkModel["id"] | undefined, InternalError.Database> {
    return dbQuery(() =>
      db.query.links.findFirst({
        where: byCode(code),
        columns: { id: true },
      }),
    );
  }

  /**
   * Soft-deletes `code` if `userId` owns it (sets `deletedAt`); someone
   * else's or an already-deleted link is `NotFound`. The code stays taken.
   */
  static delete(
    db: DB,
    code: string,
    userId: string,
  ): ResultAsync<void, LinkError.NotFound | InternalError.Database> {
    return dbQuery(() =>
      db
        .update(links)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(byCode(code), eq(links.userId, userId)))
        .run(),
    ).andThen((result) =>
      result.meta.changes > 0 ? ok(undefined) : err(LinkError.NotFound),
    );
  }

  /**
   * Changes a link's destination (re-checked against the domain rules),
   * turns it on or off, and (admins only) moves it to another user. Owners
   * can't touch a link an admin suspended; someone else's or a deleted link
   * is `NotFound`. Admins may change any link. All-or-nothing: on any error
   * nothing changes.
   */
  static update(
    db: DB,
    code: string,
    actor: Actor,
    { url, active, userId }: LinkModel["updateBody"],
  ): ResultAsync<
    LinkModel["ownedLink"],
    | LinkError.NotFound
    | LinkError.Banned
    | LinkError.Blocked
    | LinkError.OwnerNotFound
    | LinkError.OwnerChangeForbidden
    | InternalError.Database
  > {
    const admin = actor.role === "admin";
    if (userId !== undefined && !admin)
      return errAsync(LinkError.OwnerChangeForbidden as const);

    const destinationOk = <T>(link: T) =>
      url === undefined
        ? okAsync(link)
        : Rule.check(db, url).andThen((verdict) =>
            verdict === "allowed" ? ok(link) : err(LinkError.Blocked),
          );
    const ownerOk = <T>(link: T) =>
      userId === undefined
        ? okAsync(link)
        : dbQuery(() =>
            db.query.users.findFirst({
              where: and(eq(users.id, userId), isNull(users.deletedAt)),
              columns: { id: true },
            }),
          ).andThen((user) => (user ? ok(link) : err(LinkError.OwnerNotFound)));

    return dbQuery(() =>
      db.query.links.findFirst({
        where: byCode(code),
        columns: {
          id: true,
          url: true,
          userId: true,
          bannedAt: true,
          deactivatedAt: true,
        },
      }),
    )
      .andThen((link) => {
        if (!link || (!admin && link.userId !== actor.id))
          return err(LinkError.NotFound);
        if (!admin && link.bannedAt) return err(LinkError.Banned);
        return ok(link);
      })
      .andThen(destinationOk)
      .andThen(ownerOk)
      .andThen((link) => {
        const write = db
          .update(links)
          .set({
            url,
            userId,
            // Turning off twice keeps the original time (idempotent).
            ...(active === false && {
              deactivatedAt: link.deactivatedAt ?? new Date(),
            }),
            ...(active === true && {
              deactivatedAt: null,
              deactivatedReason: null,
            }),
            updatedAt: new Date(),
          })
          // Not deleted in the meantime.
          .where(and(eq(links.id, link.id), notDeleted))
          .returning({
            id: links.id,
            code: links.code,
            url: links.url,
            userId: links.userId,
            createdAt: links.createdAt,
            updatedAt: links.updatedAt,
            deactivatedAt: links.deactivatedAt,
            deactivatedReason: links.deactivatedReason,
            bannedAt: links.bannedAt,
            bannedReason: links.bannedReason,
          });
        // Owners editing their own links aren't audited; an admin changing
        // someone else's is, in the same transaction as the change.
        if (!admin || link.userId === actor.id)
          return dbQuery(() => write.get());
        const entry = Audit.afterWrite(db, {
          actorId: actor.id,
          action: "link.update",
          targetType: "link",
          targetId: link.id,
          details: {
            code,
            ...changes(
              {
                url: link.url,
                active: link.deactivatedAt === null,
                userId: link.userId,
              },
              { url, active, userId },
            ),
          },
        });
        return dbQuery(() => db.batch([write, entry])).map(([rows]) => rows[0]);
      })
      .andThen((row) => (row ? ok(row) : err(LinkError.NotFound)))
      .andThen((row) => withStatus(db, [row]).map(([updated]) => updated!));
  }

  /** The user's links, newest first. */
  static list(
    db: DB,
    userId: string,
    offset: number,
    limit: number,
  ): ResultAsync<LinkModel["ownedLink"][], InternalError.Database> {
    return dbQuery(() =>
      db.query.links.findMany({
        where: and(eq(links.userId, userId), notDeleted),
        // `created_at` has 1-second resolution; `rowid` (insertion order)
        // breaks ties so offset pages never repeat or skip a link.
        orderBy: [desc(links.createdAt), desc(sql`rowid`)],
        offset,
        limit,
        columns: ownedColumns,
      }),
    ).andThen((rows) => withStatus(db, rows));
  }
}
