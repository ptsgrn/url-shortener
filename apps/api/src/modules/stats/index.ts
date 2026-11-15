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
          description:
            "Total, per day and by device, browser and referrer domain, over inclusive Asia/Bangkok days `from`..`to`. Counts redirects, not unique people. Values that couldn't be detected are under `unknown`.",
        },
        params: StatsModel.params,
        query: StatsModel.query,
        response: {
          200: StatsModel.summary,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          404: LinkModel.notFound,
          422: StatsModel.invalidRange,
          500: internalErrorBody,
        },
      },
    );
