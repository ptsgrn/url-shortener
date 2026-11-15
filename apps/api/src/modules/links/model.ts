import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";

export enum LinkError {
  NotFound = "LINK_NOT_FOUND",
  /** The destination's host is blacklisted or on no whitelist (see `/rules`). */
  Blocked = "LINK_BLOCKED",
  /** Turned off by its owner (FR-08). */
  Disabled = "LINK_DISABLED",
  /** Suspended by an admin, or its owner's account is (FR-13, FR-15). */
  Banned = "LINK_BANNED",
  /** `userId` in an update names no existing user. */
  OwnerNotFound = "LINK_OWNER_NOT_FOUND",
  /** Only admins can change a link's owner. */
  OwnerChangeForbidden = "LINK_OWNER_CHANGE_FORBIDDEN",
}

export const LinkErrorStatus = {
  [LinkError.NotFound]: 404,
  [LinkError.Blocked]: 403,
  [LinkError.Disabled]: 403,
  [LinkError.Banned]: 403,
  [LinkError.OwnerNotFound]: 422,
  [LinkError.OwnerChangeForbidden]: 403,
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

/** HTTPS destinations only (FR-04, 3.4.4): no `http:`, `javascript:`, `data:`, `mailto:`… */
const destination = t.String({
  format: "uri",
  pattern: "^[Hh][Tt][Tt][Pp][Ss]://[^/?#]",
  maxLength: 2048,
});

/**
 * Where a link stands, most important first: `banned` (suspended by an
 * admin), `disabled` (turned off by its owner), `blocked` (fails the domain
 * rules), else `active`. A link whose owner's account is suspended doesn't
 * redirect either, whatever its status.
 */
const linkStatus = t.Union([
  t.Literal("active"),
  t.Literal("disabled"),
  t.Literal("banned"),
  t.Literal("blocked"),
]);

export const LinkModel = {
  createBody: t.Object({ url: destination }),
  /**
   * Fields to change; at least one. The code can't change (it is the short
   * link and its QR code).
   */
  updateBody: t.Object(
    {
      /** New destination, checked against the domain rules (FR-04, FR-07). */
      url: t.Optional(destination),
      /** `false` turns the link off, `true` back on (FR-08). */
      active: t.Optional(t.Boolean()),
      /** Admin only: move the link to another user. */
      userId: t.Optional(t.String({ minLength: 1 })),
    },
    { minProperties: 1 },
  ),
  params: t.Object({ code: t.String() }),
  /**
   * Public view of a link (what `GET /links/:code` returns). Deactivated and
   * banned links are still returned, so clients can say why they're down.
   */
  link: t.Object({ code: t.String(), url: t.String(), ...status }),
  /** A link as its owner (or an admin) sees it. */
  ownedLink: t.Object({
    id: t.String(),
    code: t.String(),
    url: t.String(),
    /** Owner; `null` if their account was removed. */
    userId: t.Nullable(t.String()),
    status: linkStatus,
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
  /** Why an update was refused (403). */
  updateForbidden: errorBody(
    LinkError.Blocked,
    LinkError.Banned,
    LinkError.OwnerChangeForbidden,
  ),
  ownerNotFound: errorBody(LinkError.OwnerNotFound),
  /** Why a short link doesn't redirect (FR-09); never includes the destination. */
  unavailable: errorBody(
    LinkError.Blocked,
    LinkError.Disabled,
    LinkError.Banned,
  ),
} as const;

export type LinkModel = {
  [k in keyof typeof LinkModel]: UnwrapSchema<(typeof LinkModel)[k]>;
};
