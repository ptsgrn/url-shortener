import { Elysia, t } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import {
  failWith,
  internalErrorBody,
  InternalErrorStatus,
} from "../../utils/error.ts";
import { AuthModel } from "../auth/model.ts";
import { authService } from "../auth/service.ts";
import { LinkErrorStatus, LinkModel } from "./model.ts";
import { Link } from "./service.ts";

const fail = failWith({ ...LinkErrorStatus, ...InternalErrorStatus });

/**
 * Short links, at `/links`. Looking one up is public; creating, listing and
 * deleting require a signed-in user whose account isn't suspended (FR-01).
 */
export const links = (deps: Deps) =>
  new Elysia({
    prefix: "/links",
    aot: false,
    detail: { tags: ["Links"] },
  })
    .use(authService(deps))
    .post(
      "",
      ({ body, user, status }) =>
        Link.create(deps.db, body, user.id).match((link) => link, fail(status)),
      {
        guardRole: "user",
        detail: { summary: "Create a short link" },
        body: LinkModel.createBody,
        response: {
          200: LinkModel.link,
          401: AuthModel.unauthorized,
          403: t.Union([AuthModel.forbidden, LinkModel.blocked]),
          500: internalErrorBody,
        },
      },
    )
    .get(
      "",
      ({ query, user, status }) =>
        Link.list(deps.db, user.id, query.offset ?? 0, query.limit ?? 20).match(
          (links) => links,
          fail(status),
        ),
      {
        guardRole: "user",
        detail: { summary: "List the signed-in user's links" },
        query: LinkModel.listQuery,
        response: {
          200: t.Array(LinkModel.ownedLink),
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .get(
      "/:code",
      ({ params, status }) =>
        Link.find(deps.db, params.code).match((link) => link, fail(status)),
      {
        detail: { summary: "Look up a short link by code" },
        params: LinkModel.params,
        response: {
          200: LinkModel.link,
          404: LinkModel.notFound,
          500: internalErrorBody,
        },
      },
    )
    .delete(
      "/:code",
      ({ params, user, status }) =>
        Link.delete(deps.db, params.code, user.id).match(
          () => status(204, undefined),
          fail(status),
        ),
      {
        guardRole: "user",
        detail: { summary: "Delete one of the signed-in user's links" },
        params: LinkModel.params,
        response: {
          204: t.Void(),
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          404: LinkModel.notFound,
          500: internalErrorBody,
        },
      },
    );
