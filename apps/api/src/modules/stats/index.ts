import { Elysia } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import {
  failWith,
  internalErrorBody,
  InternalErrorStatus,
} from "../../utils/error.ts";
import { AuthModel } from "../auth/model.ts";
import { authService } from "../auth/service.ts";
import { LinkErrorStatus, LinkModel } from "../links/model.ts";
import { StatsErrorStatus, StatsModel } from "./model.ts";
import { Stats } from "./service.ts";

const fail = failWith({
  ...StatsErrorStatus,
  ...LinkErrorStatus,
  ...InternalErrorStatus,
});

/**
 * Visit stats (FR-11), at `/stats`. Owner only. Visits are recorded by the
 * redirect (`/r/:code`); every redirect counts, repeats included.
 */
export const stats = (deps: Deps) =>
  new Elysia({
    prefix: "/stats",
    aot: false,
    detail: { tags: ["Stats"] },
  })
    .use(authService(deps))
    .get(
      "/:code",
      ({ params, query, user, status }) =>
        Stats.summary(deps.db, params.code, user.id, query).match(
          (summary) => summary,
          fail(status),
        ),
      {
        guardRole: "user",
        detail: {
          summary: "Visit stats for one of the signed-in user's links",
          description: [
            "Total, per day and by device, browser and referrer domain, over the inclusive calendar days `from`..`to`. Counts redirects, not unique people. Values that couldn't be detected are under `unknown`.",
            "**Days and time zones.** Days are calendar days in `tz` (default `UTC`), and the response echoes the zone used as `timeZone`. Visits are stored as UTC instants and assigned to days with the server's time-zone database, so daylight-saving changes are applied per visit. Limitations:",
            [
              "- Days are grouped from 15-minute UTC buckets. This is exact for every zone whose UTC offset is a multiple of 15 minutes, which covers all current IANA zones (including +05:30, +05:45 and +12:45). Historical local mean time offsets from before standard time are not.",
              "- A day can be 23 or 25 hours long when clocks change that day. If midnight doesn't exist (clocks jump forward at 00:00), the day starts at its first valid local time.",
              "- Past visits are always regrouped with the server's current time-zone rules, so a zone whose rules change can see old visits move between days.",
              "- Choosing a different `tz` regroups the same visits; totals over a range can differ between zones because the range boundaries move.",
              "- `tz` must be a time-zone name the server knows, such as `Asia/Bangkok` or `UTC`. Unknown names (including most abbreviations, like `ICT`) and UTC offsets like `+07:00` are refused with `STATS_INVALID_TIME_ZONE`. Aliases and legacy names (`US/Eastern`, `Asia/Calcutta`, `EST`) are accepted, and `timeZone` may echo them in another spelling.",
            ].join("\n"),
          ].join("\n\n"),
        },
        params: StatsModel.params,
        query: StatsModel.query,
        response: {
          200: StatsModel.summary,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          404: LinkModel.notFound,
          422: StatsModel.invalid,
          500: internalErrorBody,
        },
      },
    );
