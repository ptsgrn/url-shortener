import { t, type UnwrapSchema } from "elysia";

export const UserModel = {
  user: t.Object({
    id: t.String(),
    email: t.Nullable(t.String()),
    name: t.Nullable(t.String()),
    avatarUrl: t.Nullable(t.String()),
  }),
  profile: t.Object({
    email: t.Optional(t.String()),
    name: t.Optional(t.String()),
    avatarUrl: t.Optional(t.String()),
  }),
} as const;

export type UserModel = {
  [k in keyof typeof UserModel]: UnwrapSchema<(typeof UserModel)[k]>;
};
