import { t, type UnwrapSchema } from "elysia";

export const LinkModel = {
  createBody: t.Object({ url: t.String({ format: "uri" }) }),
  params: t.Object({ code: t.String() }),
  link: t.Object({ code: t.String(), url: t.String() }),
  notFound: t.Object({ message: t.Literal("Link not found") }),
} as const;

export type LinkModel = {
  [k in keyof typeof LinkModel]: UnwrapSchema<(typeof LinkModel)[k]>;
};
