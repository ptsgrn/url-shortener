import { Elysia } from "elysia";
import type { Deps } from "../../utils/deps.ts";
import { AuthModel } from "../auth/model.ts";
import { authService } from "../auth/service.ts";
import { LinkModel } from "./model.ts";
import { Link } from "./service.ts";

/** Short links, at `/links`. Creating one requires a signed-in user. */
export const links = (deps: Deps) =>
  new Elysia({ prefix: "/links", aot: false })
    .use(authService(deps))
    .post("", ({ body, user }) => Link.create(deps.db, body, user.id), {
      auth: true,
      body: LinkModel.createBody,
      response: { 200: LinkModel.link, 401: AuthModel.unauthorized },
    })
    .get("/:code", ({ params }) => Link.find(deps.db, params.code), {
      params: LinkModel.params,
      response: { 200: LinkModel.link, 404: LinkModel.notFound },
    });
