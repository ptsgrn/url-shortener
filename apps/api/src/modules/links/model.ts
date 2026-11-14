import { t, type UnwrapSchema } from "elysia";
import { errorBody } from "../../utils/error.ts";

export enum LinkError {
  NotFound = "LINK_NOT_FOUND",
}

export const LinkErrorStatus = {
  [LinkError.NotFound]: 404,
} as const satisfies Record<LinkError, number>;

export const LinkModel = {
  createBody: t.Object({ url: t.String({ format: "uri" }) }),
  params: t.Object({ code: t.String() }),
  link: t.Object({ code: t.String(), url: t.String() }),
  notFound: errorBody(LinkError.NotFound),
} as const;

export type LinkModel = {
  [k in keyof typeof LinkModel]: UnwrapSchema<(typeof LinkModel)[k]>;
};
