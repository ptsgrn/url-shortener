import { desc, eq } from "drizzle-orm";
import { err, ok, safeTry, type ResultAsync } from "neverthrow";
import type { Deps } from "../../utils/deps.ts";
import { dbQuery, type InternalError } from "../../utils/error.ts";
import { Auth } from "../auth/service.ts";
import type { CookieJar } from "../auth/cookie.ts";
import { UserError } from "../users/model.ts";
import { users } from "../users/schema.ts";
import type { DevModel } from "./model.ts";

const columns = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
} as const;

/** Dev-only user management; see `guard.ts` for how it is kept out of prod. */
export abstract class Dev {
  static listUsers({
    db,
  }: Deps): ResultAsync<DevModel["users"], InternalError> {
    return dbQuery(() =>
      db.query.users.findMany({
        columns,
        orderBy: desc(users.createdAt),
      }),
    ).map((rows) => rows.map((u) => ({ ...u, role: u.role ?? "user" })));
  }

  /** Signs in as an existing user without going through an OAuth provider. */
  static loginAs(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
    id: string,
  ): ResultAsync<DevModel["user"], UserError.NotFound | InternalError> {
    return safeTry(async function* () {
      const user = yield* dbQuery(() =>
        deps.db.query.users.findFirst({ where: eq(users.id, id), columns }),
      );
      if (!user) return err(UserError.NotFound);
      yield* Auth.startSession(deps, jar, secure, user.id);
      return ok({ ...user, role: user.role ?? "user" });
    });
  }

  /** Creates a user (no linked provider account) and signs in as them. */
  static createAndLogin(
    deps: Deps,
    jar: CookieJar,
    secure: boolean,
    { role = "user", ...profile }: DevModel["createBody"],
  ): ResultAsync<DevModel["user"], InternalError> {
    return safeTry(async function* () {
      const user = yield* dbQuery(() =>
        deps.db
          .insert(users)
          .values({ name: `Dev ${role}`, ...profile, role })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            avatarUrl: users.avatarUrl,
          })
          .get(),
      );
      yield* Auth.startSession(deps, jar, secure, user!.id);
      return ok({ ...user!, role });
    });
  }
}
