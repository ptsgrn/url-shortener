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
 * Short links, at `/links`. Looking one up is public; creating, listing,
 * updating and deleting require a signed-in user whose account isn't
 * suspended (FR-01). Admins can update any link.
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
        detail: {
          summary: "Create a short link",
          description: [
            "`url` must be HTTPS and pass the domain rules (`LINK_BLOCKED` otherwise).",
            "`code` (optional) picks the short code: 3–32 of `A–Z a–z 0–9 - + _`, case-sensitive. It is refused with `LINK_CODE_TAKEN` if any link ever used it (deleted links keep theirs) or it names one of the site's own pages. Without it, a random 7-character code is used.",
          ].join("\n\n"),
        },
        body: LinkModel.createBody,
        response: {
          200: LinkModel.link,
          401: AuthModel.unauthorized,
          403: t.Union([AuthModel.forbidden, LinkModel.blocked]),
          409: LinkModel.codeTaken,
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
    .patch(
      "/:code",
      ({ params, body, user, status }) =>
        Link.update(deps.db, params.code, user, body).match(
          (link) => link,
          fail(status),
        ),
      {
        guardRole: "user",
        detail: {
          summary: "Change a link's destination, on/off state or owner",
          description: [
            "Owners change their own links: `url` (checked against the domain rules, like on create) and `active` (`false` turns the link off, `true` back on). The code never changes.",
            "Admins can change any link, including one they suspended, and can move it to another user with `userId`.",
            "A link suspended by an admin can't be changed by its owner (`LINK_BANNED`). Someone else's or a deleted link is 404.",
          ].join("\n\n"),
        },
        params: LinkModel.params,
        body: LinkModel.updateBody,
        response: {
          200: LinkModel.ownedLink,
          401: AuthModel.unauthorized,
          403: t.Union([AuthModel.forbidden, LinkModel.updateForbidden]),
          404: LinkModel.notFound,
          422: LinkModel.ownerNotFound,
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
