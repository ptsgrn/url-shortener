import { and, asc, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { err, errAsync, ok, okAsync, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, type InternalError } from "../../utils/error.ts";
import { LinkError } from "../links/model.ts";
import { links } from "../links/schema.ts";
import { StatsError, type StatsModel } from "./model.ts";
import { browserOf, deviceOf, referrerHost } from "./parse.ts";
import { linkVisits } from "./schema.ts";
import {
  BUCKET_SECONDS,
  localDay,
  localDayStart,
  nextDay,
  parseTimeZone,
} from "./zone.ts";

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
   * Visit stats for the owner's link `code` (FR-11), over inclusive calendar
   * days `from`..`to` in time zone `tz` (default UTC; either day may be
   * omitted). Owners see their own links; admins any link (FR-03). Someone
   * else's (for a non-admin) or a deleted link is `NotFound`.
   *
   * Days per time zone: `from`/`to` become UTC instants (the start of each
   * local day), and visits are counted per 15-minute UTC bucket in SQL, then
   * each bucket is assigned to the local day it starts on. Every current
   * time-zone offset is a multiple of 15 minutes, so a bucket never spans
   * two local days.
   */
  static summary(
    db: DB,
    code: string,
    actor: { id: string; role: "user" | "admin" },
    { from, to, tz }: StatsModel["query"],
  ): ResultAsync<
    StatsModel["summary"],
    | LinkError.NotFound
    | StatsError.InvalidRange
    | StatsError.InvalidTimeZone
    | InternalError.Database
  > {
    const zone = tz === undefined ? "UTC" : parseTimeZone(tz);
    if (!zone) return errAsync(StatsError.InvalidTimeZone as const);
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
          actor.role === "admin" ? undefined : eq(links.userId, actor.id),
          isNull(links.deletedAt),
        ),
        columns: { id: true },
      }),
    )
      .andThen((link) => (link ? ok(link.id) : err(LinkError.NotFound)))
      .andThen((linkId) => {
        const where = and(
          eq(linkVisits.linkId, linkId),
          from
            ? gte(linkVisits.visitedAt, new Date(localDayStart(zone, from)))
            : undefined,
          to
            ? lt(
                linkVisits.visitedAt,
                new Date(localDayStart(zone, nextDay(to))),
              )
            : undefined,
        );
        // `visited_at` is Unix seconds: the start of its 15-minute UTC bucket.
        const bucket = sql<number>`(${linkVisits.visitedAt} / ${BUCKET_SECONDS}) * ${BUCKET_SECONDS}`;
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
              .select({ bucket, count: count() })
              .from(linkVisits)
              .where(where)
              .groupBy(bucket)
              .orderBy(asc(bucket)),
            by(linkVisits.device),
            by(linkVisits.browser),
            by(linkVisits.referrerHost),
          ]),
        );
      })
      .map(([buckets, devices, browsers, referrers]) => {
        // Buckets come oldest first, so days come out in order too.
        const perDay = new Map<string, number>();
        for (const b of buckets) {
          const date = localDay(zone, b.bucket * 1000);
          perDay.set(date, (perDay.get(date) ?? 0) + b.count);
        }
        const daily = [...perDay].map(([date, count]) => ({ date, count }));
        return {
          timeZone: zone,
          total: daily.reduce((sum, d) => sum + d.count, 0),
          daily,
          devices: toRecord(devices),
          browsers: toRecord(browsers),
          referrers: toRecord(referrers),
        };
      });
  }
}
