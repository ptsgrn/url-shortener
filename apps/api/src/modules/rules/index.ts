import { Elysia, t } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import {
  failWith,
  internalErrorBody,
  InternalErrorStatus,
} from "../../utils/error.ts";
import { AuthModel } from "../auth/model.ts";
import { authService } from "../auth/service.ts";
import { RuleErrorStatus, RuleModel } from "./model.ts";
import { Rule } from "./service.ts";

const fail = failWith({ ...RuleErrorStatus, ...InternalErrorStatus });

/**
 * Domain whitelist / blacklist (FR-14), at `/rules`. Admin only. A link's
 * host must match at least one whitelist rule and no blacklist rule. Every
 * link check sees the current rules, so changes apply at once to new links
 * and to opening existing ones.
 */
export const rules = (deps: Deps) =>
  new Elysia({
    prefix: "/rules",
    aot: false,
    detail: { tags: ["Rules"] },
  })
    .use(authService(deps))
    .get(
      "",
      ({ query, status }) =>
        Rule.list(deps.db, query).match((rules) => rules, fail(status)),
      {
        guardRole: "admin",
        detail: { summary: "List domain rules" },
        query: RuleModel.listQuery,
        response: {
          200: t.Array(RuleModel.rule),
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .post(
      "",
      ({ body, user, status }) =>
        Rule.create(deps.db, body, user.id).match(
          (rule) => status(201, rule),
          fail(status),
        ),
      {
        guardRole: "admin",
        detail: {
          summary: "Add a domain rule",
          description: [
            "A link is allowed only if its host matches at least one whitelist rule and no blacklist rule.",
            "`type: domain` (default): a hostname (`example.com`) or leading wildcard (`*.example.com`, subdomains only); paths, queries, ports and other wildcards are rejected.",
            "`type: regex`: an RE2 pattern matched against the whole hostname, case-insensitively (no backreferences or lookarounds, max 256 chars).",
          ].join("\n\n"),
        },
        body: RuleModel.createBody,
        response: {
          201: RuleModel.rule,
          400: RuleModel.invalid,
          409: RuleModel.duplicate,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .patch(
      "/:id",
      ({ params, body, user, status }) =>
        Rule.update(deps.db, params.id, body, user.id).match(
          (rule) => rule,
          fail(status),
        ),
      {
        guardRole: "admin",
        detail: { summary: "Change a domain rule's list or pattern" },
        params: RuleModel.params,
        body: RuleModel.updateBody,
        response: {
          200: RuleModel.rule,
          400: RuleModel.invalid,
          404: RuleModel.notFound,
          409: RuleModel.duplicate,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    )
    .delete(
      "/:id",
      ({ params, user, status }) =>
        Rule.delete(deps.db, params.id, user.id).match(
          () => status(204, undefined),
          fail(status),
        ),
      {
        guardRole: "admin",
        detail: { summary: "Remove a domain rule" },
        params: RuleModel.params,
        response: {
          204: t.Void(),
          404: RuleModel.notFound,
          401: AuthModel.unauthorized,
          403: AuthModel.forbidden,
          500: internalErrorBody,
        },
      },
    );
