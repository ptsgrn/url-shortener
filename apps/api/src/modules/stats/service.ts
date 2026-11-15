import { and, asc, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { err, errAsync, ok, okAsync, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, type InternalError } from "../../utils/error.ts";
import { LinkError } from "../links/model.ts";
import { links } from "../links/schema.ts";
import { StatsError, type StatsModel } from "./model.ts";
import {
  BANGKOK_OFFSET_SECONDS,
  bangkokDayEnd,
  bangkokDayStart,
  browserOf,
  deviceOf,
  referrerHost,
} from "./parse.ts";
import { linkVisits } from "./schema.ts";

const UNKNOWN = "unknown";

/** A real calendar day: `2026-02-30` parses but isn't one. */
const isDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;

const toRecord = (rows: { key: string | null; count: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.key ?? UNKNOWN, r.count]));

export abstract class Stats {
  /**
   * Records one visit from the redirect's request headers. Never fails: a
   * stats error is logged and swallowed, so it can't break a valid redirect
   * (FR-09). Stores the referrer's host only, and no IP or user agent.
   */
  static record(
    db: DB,
    linkId: string,
    headers: Headers,
  ): ResultAsync<void, never> {
    const ua = headers.get("user-agent");
    return dbQuery(() =>
      db.insert(linkVisits).values({
        linkId,
        device: deviceOf(ua),
        browser: browserOf(ua),
        referrerHost: referrerHost(headers.get("referer")),
      }),
    )
      .map(() => undefined)
      .orElse(() => okAsync(undefined));
  }

  /**
   * Visit stats for the owner's link `code` (FR-11), over inclusive Bangkok
   * days `from`..`to` (either may be omitted). Someone else's or a deleted
   * link is `NotFound`.
   */
  static summary(
    db: DB,
    code: string,
    userId: string,
    { from, to }: StatsModel["query"],
  ): ResultAsync<
    StatsModel["summary"],
    LinkError.NotFound | StatsError.InvalidRange | InternalError.Database
  > {
    if (
      (from && !isDay(from)) ||
      (to && !isDay(to)) ||
      (from && to && from > to)
    )
      return errAsync(StatsError.InvalidRange as const);

    return dbQuery(() =>
      db.query.links.findFirst({
        where: and(
          eq(links.code, code),
          eq(links.userId, userId),
          isNull(links.deletedAt),
        ),
        columns: { id: true },
      }),
    )
      .andThen((link) => (link ? ok(link.id) : err(LinkError.NotFound)))
      .andThen((linkId) => {
        const where = and(
          eq(linkVisits.linkId, linkId),
          from ? gte(linkVisits.visitedAt, bangkokDayStart(from)) : undefined,
          to ? lt(linkVisits.visitedAt, bangkokDayEnd(to)) : undefined,
        );
        const day = sql<string>`date(${linkVisits.visitedAt} + ${BANGKOK_OFFSET_SECONDS}, 'unixepoch')`;
        const by = (
          key:
            | typeof linkVisits.device
            | typeof linkVisits.browser
            | typeof linkVisits.referrerHost,
        ) =>
          db
            .select({ key, count: count() })
            .from(linkVisits)
            .where(where)
            .groupBy(key);
        return dbQuery(() =>
          db.batch([
            db
              .select({ date: day, count: count() })
              .from(linkVisits)
              .where(where)
              .groupBy(day)
              .orderBy(asc(day)),
            by(linkVisits.device),
            by(linkVisits.browser),
            by(linkVisits.referrerHost),
          ]),
        );
      })
      .map(([daily, devices, browsers, referrers]) => ({
        total: daily.reduce((sum, d) => sum + d.count, 0),
        daily,
        devices: toRecord(devices),
        browsers: toRecord(browsers),
        referrers: toRecord(referrers),
      }));
  }
}
