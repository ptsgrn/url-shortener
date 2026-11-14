import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";

export enum LinkError {
  NotFound = "LINK_NOT_FOUND",
  /** The destination's host is blacklisted or on no whitelist (see `/rules`). */
  Blocked = "LINK_BLOCKED",
}

export const LinkErrorStatus = {
  [LinkError.NotFound]: 404,
  [LinkError.Blocked]: 403,
} as const satisfies Record<LinkError, number>;

/**
 * Why a link no longer redirects. `blocked` (host blacklisted or not
 * whitelisted) is computed from the current domain rules on every read; the other fields are `null` when not set.
 */
const status = {
  blocked: t.Boolean(),
  deactivatedAt: t.Nullable(t.Date()),
  deactivatedReason: t.Nullable(t.String()),
  bannedAt: t.Nullable(t.Date()),
  bannedReason: t.Nullable(t.String()),
};

export const LinkModel = {
  /** HTTPS destinations only (FR-04, 3.4.4): no `http:`, `javascript:`, `data:`, `mailto:`… */
  createBody: t.Object({
    url: t.String({
      format: "uri",
      pattern: "^[Hh][Tt][Tt][Pp][Ss]://[^/?#]",
      maxLength: 2048,
    }),
  }),
  params: t.Object({ code: t.String() }),
  /**
   * Public view of a link (what `GET /links/:code` returns). Deactivated and
   * banned links are still returned, so clients can say why they're down.
   */
  link: t.Object({ code: t.String(), url: t.String(), ...status }),
  /** A link as its owner sees it. */
  ownedLink: t.Object({
    id: t.String(),
    code: t.String(),
    url: t.String(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
    ...status,
  }),
  listQuery: t.Object({
    offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
  }),
  id: t.Object({ id: t.String() }),
  notFound: errorBody(LinkError.NotFound),
  blocked: errorBody(LinkError.Blocked),
} as const;

export type LinkModel = {
  [k in keyof typeof LinkModel]: UnwrapSchema<(typeof LinkModel)[k]>;
};
