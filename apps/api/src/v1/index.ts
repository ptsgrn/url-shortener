import { Elysia } from "elysia";
import { auth } from "../modules/auth/index.ts";
import { links } from "../modules/links/index.ts";
import { redirect } from "../modules/links/redirect.ts";
import { rules } from "../modules/rules/index.ts";
import { stats } from "../modules/stats/index.ts";
import type { Deps } from "../utils/deps.ts";

/** Version 1 of the public API, mounted at `/api/v1` by `app.ts`. */
export const v1 = (deps: Deps) =>
  new Elysia({ aot: false })
    .use(auth(deps))
    .use(links(deps))
    .use(rules(deps))
    .use(stats(deps))
    .use(redirect(deps));
