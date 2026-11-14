import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";
import { UserError } from "../users/model.ts";

export enum DevError {
  /** Dev tools are off for this request (see `guard.ts`). */
  Disabled = "DEV_DISABLED",
}

export const DevErrorStatus = {
  [DevError.Disabled]: 404,
} as const satisfies Record<DevError, number>;

const role = t.UnionEnum(["user", "admin"]);

const user = t.Object({
  id: t.String(),
  email: t.Nullable(t.String()),
  name: t.Nullable(t.String()),
  avatarUrl: t.Nullable(t.String()),
  role,
});

export const DevModel = {
  user,
  users: t.Array(user),
  createBody: t.Object({
    name: t.Optional(t.String({ minLength: 1 })),
    email: t.Optional(t.String({ format: "email" })),
    avatarUrl: t.Optional(t.String({ format: "uri" })),
    role: t.Optional(role),
  }),
  userParams: t.Object({ id: t.String() }),
  disabled: errorBody(DevError.Disabled),
  loginFailed: errorBody(DevError.Disabled, UserError.NotFound),
} as const;

export type DevModel = {
  [k in keyof typeof DevModel]: UnwrapSchema<(typeof DevModel)[k]>;
};
