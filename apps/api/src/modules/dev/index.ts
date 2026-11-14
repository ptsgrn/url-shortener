import Elysia from "elysia";
import { authService } from "../auth/service";
import { Deps } from "../../app";

export const devHelpers = (deps: Deps) =>
  new Elysia({
    prefix: "/dev",
    aot: false,
    detail: { tags: ["Dev"] },
  }).use(authService(deps));
