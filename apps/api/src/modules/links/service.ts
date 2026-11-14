import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { err, errAsync, ok, okAsync, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, InternalError } from "../../utils/error.ts";
import { Rule } from "../rules/service.ts";
import { LinkError, type LinkModel } from "./model.ts";
import { randomCode } from "./random.ts";
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

export abstract class Link {
  static create(
    db: DB,
    { url }: LinkModel["createBody"],
    userId: string,
  ): ResultAsync<
    LinkModel["link"],
    LinkError.Blocked | InternalError.Database
  > {
    // Insert with a random code; on a `code` unique conflict nothing is
    // inserted (no row returned), so retry with a new code.
    const attempt = (
      left: number,
    ): ResultAsync<LinkModel["link"], InternalError.Database> =>
      dbQuery(() =>
        db
          .insert(links)
          .values({ code: randomCode(), url, userId })
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
      ).andThen((link) => {
        if (link) return okAsync({ ...link, blocked: false });
        if (left > 1) return attempt(left - 1);
        console.error(
          `[${InternalError.Database}] no free link code after ${MAX_CODE_ATTEMPTS} attempts`,
        );
        return errAsync(InternalError.Database as const);
      });

    return Rule.check(db, url).andThen((verdict) =>
      verdict !== "allowed"
        ? errAsync(LinkError.Blocked as const)
        : attempt(MAX_CODE_ATTEMPTS),
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
        columns: {
          id: true,
          code: true,
          url: true,
          createdAt: true,
          updatedAt: true,
          ...statusColumns,
        },
      }),
    ).andThen((rows) => withBlocked(db, rows));
  }
}
