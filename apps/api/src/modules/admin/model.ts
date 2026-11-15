import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";
import { LinkModel } from "../links/model.ts";
import { UserError } from "../users/model.ts";

export enum AdminError {
  /** An admin can't suspend their own account. */
  CannotSuspendSelf = "ADMIN_CANNOT_SUSPEND_SELF",
  /**
   * Admins can't suspend each other (roles are only changed in the
   * database, so this keeps admins from locking each other out).
   */
  CannotSuspendAdmin = "ADMIN_CANNOT_SUSPEND_ADMIN",
}

export const AdminErrorStatus = {
  [AdminError.CannotSuspendSelf]: 403,
  [AdminError.CannotSuspendAdmin]: 403,
} as const satisfies Record<AdminError, number>;

const page = {
  offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
};

/** Substring search; `%` and `_` match literally. */
const search = (description: string) =>
  t.Optional(t.String({ minLength: 1, maxLength: 200, description }));

const role = t.Union([t.Literal("user"), t.Literal("admin")]);
const accountStatus = t.Union([t.Literal("active"), t.Literal("suspended")]);

const user = t.Object({
  id: t.String(),
  email: t.Nullable(t.String()),
  name: t.Nullable(t.String()),
  avatarUrl: t.Nullable(t.String()),
  role,
  status: accountStatus,
  suspendedAt: t.Nullable(t.String({ format: "date-time" })),
  suspendedReason: t.Nullable(t.String()),
  createdAt: t.Date(),
  /** Links they hold, not counting deleted ones. */
  linkCount: t.Number(),
});

const auditAction = t.Union([
  t.Literal("user.suspend"),
  t.Literal("user.restore"),
  t.Literal("link.update"),
  t.Literal("rule.create"),
  t.Literal("rule.update"),
  t.Literal("rule.delete"),
]);
const auditTarget = t.Union([
  t.Literal("user"),
  t.Literal("link"),
  t.Literal("rule"),
]);

export const AdminModel = {
  userParams: t.Object({ id: t.String() }),
  usersQuery: t.Object({
    q: search("Matches email or name."),
    role: t.Optional(role),
    status: t.Optional(accountStatus),
    ...page,
  }),
  user,
  userDetail: t.Object({
    ...user.properties,
    /** Their links by state (deleted links keep their codes reserved). */
    links: t.Object({
      total: t.Number(),
      disabled: t.Number(),
      banned: t.Number(),
      deleted: t.Number(),
    }),
  }),
  suspendBody: t.Object({
    /** Shown to other admins in the audit log, and kept on the account. */
    reason: t.String({ minLength: 1, maxLength: 500 }),
  }),
  /** Optional; a request without a body is fine. */
  restoreBody: t.Union([
    t.Object({
      reason: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
    }),
    t.Undefined(),
  ]),
  linksQuery: t.Object({
    q: search("Matches the code or the destination URL."),
    ownerId: t.Optional(t.String()),
    status: t.Optional(
      t.Union([
        t.Literal("active"),
        t.Literal("disabled"),
        t.Literal("banned"),
        t.Literal("blocked"),
      ]),
    ),
    deleted: t.Optional(
      t.Boolean({
        default: false,
        description:
          "`true` lists only deleted links (their codes stay reserved).",
      }),
    ),
    ...page,
  }),
  link: t.Object({
    ...LinkModel.ownedLink.properties,
    deletedAt: t.Nullable(t.Date()),
    owner: t.Nullable(
      t.Object({
        id: t.String(),
        email: t.Nullable(t.String()),
        name: t.Nullable(t.String()),
      }),
    ),
  }),
  auditQuery: t.Object({
    actorId: t.Optional(t.String()),
    action: t.Optional(auditAction),
    targetType: t.Optional(auditTarget),
    targetId: t.Optional(t.String()),
    ...page,
  }),
  auditEntry: t.Object({
    id: t.String(),
    action: auditAction,
    targetType: auditTarget,
    targetId: t.String(),
    reason: t.Nullable(t.String()),
    /** What changed: `{ field: { from, to } }`, or the created/deleted values. */
    details: t.Nullable(t.Record(t.String(), t.Unknown())),
    createdAt: t.Date(),
    /** `null` once the admin's account is removed. */
    actor: t.Nullable(
      t.Object({
        id: t.String(),
        email: t.Nullable(t.String()),
        name: t.Nullable(t.String()),
      }),
    ),
  }),
  userNotFound: errorBody(UserError.NotFound),
  suspendForbidden: errorBody(
    AdminError.CannotSuspendSelf,
    AdminError.CannotSuspendAdmin,
  ),
} as const;

export type AdminModel = {
  [K in keyof typeof AdminModel]: UnwrapSchema<(typeof AdminModel)[K]>;
};
