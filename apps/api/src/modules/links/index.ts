import { Elysia } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import {
  failWith,
  internalErrorBody,
  InternalErrorStatus,
} from "../../utils/error.ts";
import { AuthModel } from "../auth/model.ts";
import { authService } from "../auth/service.ts";
import { LinkErrorStatus, LinkModel } from "./model.ts";
import { Link } from "./service.ts";

const fail = failWith({ ...LinkErrorStatus, ...InternalErrorStatus });

/** Short links, at `/links`. Creating one requires a signed-in user. */
export const links = (deps: Deps) =>
  new Elysia({ prefix: "/links", aot: false })
    .use(authService(deps))
    .post(
      "",
      ({ body, user, status }) =>
        Link.create(deps.db, body, user.id).match((link) => link, fail(status)),
      {
        auth: true,
        body: LinkModel.createBody,
        response: {
          200: LinkModel.link,
          401: AuthModel.unauthorized,
          500: internalErrorBody,
        },
      },
    )
    .get(
      "/:code",
      ({ params, status }) =>
        Link.find(deps.db, params.code).match((link) => link, fail(status)),
      {
        params: LinkModel.params,
        response: {
          200: LinkModel.link,
          404: LinkModel.notFound,
          500: internalErrorBody,
        },
      },
    );
