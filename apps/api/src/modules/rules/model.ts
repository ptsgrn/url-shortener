import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";
import { MAX_REGEX_LENGTH } from "./matcher.ts";

export enum RuleError {
  NotFound = "RULE_NOT_FOUND",
  /**
   * A `domain` rule that isn't a bare hostname or `*.hostname` (scheme, path,
   * query, port, misplaced `*`), or a `regex` rule that isn't valid RE2
   * (backreferences and lookarounds are unsupported) or is over 256 chars.
   */
  InvalidPattern = "RULE_INVALID_PATTERN",
  /** The same pattern is already on that list. */
  Duplicate = "RULE_DUPLICATE",
}

export const RuleErrorStatus = {
  [RuleError.NotFound]: 404,
  [RuleError.InvalidPattern]: 400,
  [RuleError.Duplicate]: 409,
} as const satisfies Record<RuleError, number>;

// `t.Union` of literals, not `t.UnionEnum`: Elysia fills a missing optional
// `UnionEnum` query param with one of its members, so `?list=` would never be
// omitted.
const list = t.Union([t.Literal("whitelist"), t.Literal("blacklist")]);
const type = t.Union([t.Literal("domain"), t.Literal("regex")]);

export const RuleModel = {
  rule: t.Object({
    id: t.String(),
    list,
    type,
    pattern: t.String(),
    createdBy: t.Nullable(t.String()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  }),
  createBody: t.Object({
    list,
    /** Defaults to `domain`. */
    type: t.Optional(type),
    pattern: t.String({ minLength: 1, maxLength: MAX_REGEX_LENGTH }),
  }),
  updateBody: t.Object({
    list: t.Optional(list),
    type: t.Optional(type),
    pattern: t.Optional(
      t.String({ minLength: 1, maxLength: MAX_REGEX_LENGTH }),
    ),
  }),
  listQuery: t.Object({
    list: t.Optional(list),
    type: t.Optional(type),
    offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 50 })),
  }),
  params: t.Object({ id: t.String() }),
  notFound: errorBody(RuleError.NotFound),
  invalid: errorBody(RuleError.InvalidPattern),
  duplicate: errorBody(RuleError.Duplicate),
} as const;

export type RuleModel = {
  [k in keyof typeof RuleModel]: UnwrapSchema<(typeof RuleModel)[k]>;
};
