import { Elysia } from "elysia";
import { inBackground, type Deps } from "../../utils/deps.ts";
import {
  failWith,
  internalErrorBody,
  InternalErrorStatus,
} from "../../utils/error.ts";
import { Stats } from "../stats/service.ts";
import { LinkErrorStatus, LinkModel } from "./model.ts";
import { Link } from "./service.ts";

const fail = failWith({ ...LinkErrorStatus, ...InternalErrorStatus });

/**
 * Opening a short link (FR-09), at `/r/:code`: public, no session touched.
 * The web app's `/{code}` route forwards here. A redirect that passes every
 * check is recorded for stats (FR-11), after the response where the host
 * provides `Deps.waitUntil`, and answered with a temporary 302, so
 * browsers re-ask each time and later edits, disables and rule changes apply.
 * Anything else gets `{ error }` explaining why, with no `Location`.
 */
export const redirect = (deps: Deps) =>
  new Elysia({
    prefix: "/r",
    aot: false,
    detail: { tags: ["Redirect"] },
  }).get(
    "/:code",
    ({ params, request, redirect: goto, status, set }) =>
      Link.resolve(deps.db, params.code)
        .andThen((link) =>
          // Recorded after the response where the host allows (FR-09: the
          // visitor isn't kept waiting, and a stats failure can't break it).
          inBackground(
            deps,
            Stats.record(deps.db, link.id, request.headers),
          ).map(() => link),
        )
        .match((link) => {
          set.headers["cache-control"] = "no-store";
          return goto(link.url, 302);
        }, fail(status)),
    {
      detail: { summary: "Open a short link" },
      params: LinkModel.params,
      response: {
        404: LinkModel.notFound,
        403: LinkModel.unavailable,
        500: internalErrorBody,
      },
    },
  );
