import { Elysia, t } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import {
  failWith,
  internalErrorBody,
  InternalErrorStatus,
} from "../../utils/error.ts";
import { AuthModel } from "../auth/model.ts";
import { authService } from "../auth/service.ts";
import { LinkErrorStatus } from "../links/model.ts";
import { UserErrorStatus } from "../users/model.ts";
import { AdminErrorStatus, AdminModel } from "./model.ts";
import { Admin } from "./service.ts";

const fail = failWith({
  ...AdminErrorStatus,
  ...UserErrorStatus,
  ...LinkErrorStatus,
  ...InternalErrorStatus,
});

/**
 * Admin oversight (FR-03, FR-15), at `/admin`: accounts and their
 * suspension, every user's links, and the audit log of admin actions.
 * Admin only. Roles themselves are set in the database, not through the API.
 */
export const admin = (deps: Deps) =>
  new Elysia({
    prefix: "/admin",
    aot: false,
    detail: { tags: ["Admin"] },
  })
    .use(authService(deps))
    .get(
      "/users",
      ({ query, status }) =>
        Admin.listUsers(deps.db, query).match((users) => users, fail(status)),
      {
        guardRole: "admin",
        detail: {
          summary: "List accounts",
          description:
            "Newest first. Deleted accounts are left out. `q` matches email or name (substring, case-insensitive for ASCII).",
        },
        query: AdminModel.usersQuery,
        response: {
          200: t.Array(AdminModel.user),
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .get(
      "/users/:id",
      ({ params, status }) =>
        Admin.getUser(deps.db, params.id).match((user) => user, fail(status)),
      {
        guardRole: "admin",
        detail: { summary: "One account, with its link counts" },
        params: AdminModel.userParams,
        response: {
          200: AdminModel.userDetail,
          404: AdminModel.userNotFound,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .post(
      "/users/:id/suspension",
      ({ params, body, user, status }) =>
        Admin.suspend(deps.db, user, params.id, body).match(
          (user) => user,
          fail(status),
        ),
      {
        guardRole: "admin",
        detail: {
          summary: "Suspend an account",
          description: [
            "The account can no longer create or manage links, its links stop redirecting, and all of its sessions end at once. Its links and their codes are kept.",
            "The reason is stored on the account and in the audit log. Suspending an already suspended account changes nothing and returns it as is.",
            "Admins can't suspend themselves (`ADMIN_CANNOT_SUSPEND_SELF`) or another admin (`ADMIN_CANNOT_SUSPEND_ADMIN`); change the role in the database first.",
          ].join("\n\n"),
        },
        params: AdminModel.userParams,
        body: AdminModel.suspendBody,
        response: {
          200: AdminModel.userDetail,
          404: AdminModel.userNotFound,
          401: AuthModel.unauthorized,
          403: t.Union([AuthModel.forbidden, AdminModel.suspendForbidden]),
          500: internalErrorBody,
        },
      },
    )
    .delete(
      "/users/:id/suspension",
      ({ params, body, user, status }) =>
        Admin.restore(deps.db, user, params.id, body?.reason).match(
          (user) => user,
          fail(status),
        ),
      {
        guardRole: "admin",
        detail: {
          summary: "Lift an account's suspension",
          description:
            "The user must sign in again: the sessions ended by the suspension stay ended. Their links redirect again only if they pass their own state and the domain rules. Restoring an active account changes nothing.",
        },
        params: AdminModel.userParams,
        body: AdminModel.restoreBody,
        response: {
          200: AdminModel.userDetail,
          404: AdminModel.userNotFound,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .get(
      "/links",
      ({ query, status }) =>
        Admin.listLinks(deps.db, query).match((links) => links, fail(status)),
      {
        guardRole: "admin",
        detail: {
          summary: "List every user's links",
          description:
            "Newest first, with each link's owner. `offset` and `limit` count links that match every filter, so a page shorter than `limit` is the last one. `status=active|blocked` depends on the current domain rules and is evaluated per link, so a large `offset` with those filters scans more links and is slower.",
        },
        query: AdminModel.linksQuery,
        response: {
          200: t.Array(AdminModel.link),
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .post(
      "/links/:code/ban",
      ({ params, body, user, status }) =>
        Admin.banLink(deps.db, user, params.code, body).match(
          (link) => link,
          fail(status),
        ),
      {
        guardRole: "admin",
        detail: {
          summary: "Ban a link",
          description: [
            "The link stops redirecting (`LINK_BANNED`), and its owner can no longer change it, so they can't turn it back on or point it elsewhere (`LINK_BANNED` on `PATCH /links/:code`). Its code stays taken.",
            "The reason is stored on the link, where its owner sees it, and in the audit log. Banning an already banned link changes nothing and returns it as is. A deleted link is 404.",
          ].join("\n\n"),
        },
        params: AdminModel.linkParams,
        body: AdminModel.banBody,
        response: {
          200: AdminModel.link,
          404: AdminModel.linkNotFound,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .delete(
      "/links/:code/ban",
      ({ params, body, user, status }) =>
        Admin.unbanLink(deps.db, user, params.code, body?.reason).match(
          (link) => link,
          fail(status),
        ),
      {
        guardRole: "admin",
        detail: {
          summary: "Lift a link's ban",
          description:
            "The owner can manage the link again. It redirects again only if the owner hadn't turned it off, their account isn't suspended, and it passes the domain rules. Unbanning a link that isn't banned changes nothing.",
        },
        params: AdminModel.linkParams,
        body: AdminModel.restoreBody,
        response: {
          200: AdminModel.link,
          404: AdminModel.linkNotFound,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .get(
      "/audit",
      ({ query, status }) =>
        Admin.audit(deps.db, query).match((entries) => entries, fail(status)),
      {
        guardRole: "admin",
        detail: {
          summary: "The audit log of admin actions",
          description:
            "Newest first: account suspensions and restores, link bans and unbans, admin changes to other users' links (including owner changes), and domain rule changes. Each entry has the admin, the time, the reason when one was given, and what changed.",
        },
        query: AdminModel.auditQuery,
        response: {
          200: t.Array(AdminModel.auditEntry),
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    );
