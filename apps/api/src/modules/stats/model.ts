import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";

export enum StatsError {
  /** `to` is before `from`, or a date doesn't exist. */
  InvalidRange = "STATS_INVALID_RANGE",
  /** `tz` isn't a time zone the server knows. */
  InvalidTimeZone = "STATS_INVALID_TIME_ZONE",
}

export const StatsErrorStatus = {
  [StatsError.InvalidRange]: 422,
  [StatsError.InvalidTimeZone]: 422,
} as const satisfies Record<StatsError, number>;

const day = (description: string) =>
  t.String({
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    examples: ["2026-11-15"],
    description,
  });
/** Count per value; visits with no detectable value are under `unknown`. */
const breakdown = t.Record(t.String(), t.Number());

export const StatsModel = {
  params: t.Object({ code: t.String() }),
  query: t.Object({
    from: t.Optional(
      day(
        "First day to include (`YYYY-MM-DD`, a calendar day in `tz`). Omit for no lower bound.",
      ),
    ),
    to: t.Optional(
      day(
        "Last day to include, inclusive (`YYYY-MM-DD`, a calendar day in `tz`). Omit for no upper bound.",
      ),
    ),
    tz: t.Optional(
      t.String({
        maxLength: 64,
        examples: ["Asia/Bangkok", "America/New_York", "UTC"],
        description:
          "IANA time zone that defines calendar days for `from`, `to` and `daily` (case-insensitive). Default `UTC`. In a browser: `Intl.DateTimeFormat().resolvedOptions().timeZone`.",
      }),
    ),
  }),
  summary: t.Object({
    /** The time zone the days are in, as the server names it (e.g. `Asia/Bangkok`). */
    timeZone: t.String(),
    /** Redirects, repeats included: not unique people. */
    total: t.Number(),
    /** Local days (in `timeZone`) with at least one visit, oldest first. */
    daily: t.Array(t.Object({ date: t.String(), count: t.Number() })),
    devices: breakdown,
    browsers: breakdown,
    /** By referrer domain. */
    referrers: breakdown,
  }),
  invalid: errorBody(StatsError.InvalidRange, StatsError.InvalidTimeZone),
} as const;

export type StatsModel = {
  [K in keyof typeof StatsModel]: UnwrapSchema<(typeof StatsModel)[K]>;
};
