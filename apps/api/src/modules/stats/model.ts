import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";

export enum StatsError {
  /** `to` is before `from`, or a date doesn't exist. */
  InvalidRange = "STATS_INVALID_RANGE",
}

export const StatsErrorStatus = {
  [StatsError.InvalidRange]: 422,
} as const satisfies Record<StatsError, number>;

const day = t.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  examples: ["2026-11-15"],
});
/** Count per value; visits with no detectable value are under `unknown`. */
const breakdown = t.Record(t.String(), t.Number());

export const StatsModel = {
  params: t.Object({ code: t.String() }),
  /** Inclusive Bangkok calendar days; either end may be omitted. */
  query: t.Object({ from: t.Optional(day), to: t.Optional(day) }),
  summary: t.Object({
    /** Redirects, repeats included: not unique people. */
    total: t.Number(),
    /** Days with at least one visit, oldest first. */
    daily: t.Array(t.Object({ date: t.String(), count: t.Number() })),
    devices: breakdown,
    browsers: breakdown,
    /** By referrer domain. */
    referrers: breakdown,
  }),
  invalidRange: errorBody(StatsError.InvalidRange),
} as const;

export type StatsModel = {
  [K in keyof typeof StatsModel]: UnwrapSchema<(typeof StatsModel)[K]>;
};
