import { eq } from "drizzle-orm";
import { err, ok, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, type InternalError } from "../../utils/error.ts";
import { UserError, type UserModel } from "./model.ts";
import { users } from "./schema.ts";

const publicColumns = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
} as const;

export abstract class User {
  static findById(
    db: DB,
    id: string,
  ): ResultAsync<
    UserModel["user"],
    UserError.NotFound | InternalError.Database
  > {
    return dbQuery(() =>
      db.query.users.findFirst({
        where: eq(users.id, id),
        columns: publicColumns,
      }),
    ).andThen((user) => (user ? ok(user) : err(UserError.NotFound)));
  }

  /** Creates a user and returns its id. */
  static create(
    db: DB,
    profile: UserModel["profile"],
  ): ResultAsync<string, InternalError.Database> {
    return dbQuery(() =>
      db.insert(users).values(profile).returning({ id: users.id }).get(),
    ).map((user) => user!.id);
  }

  static updateProfile(
    db: DB,
    id: string,
    profile: UserModel["profile"],
  ): ResultAsync<void, InternalError.Database> {
    return dbQuery(() =>
      db.update(users).set(profile).where(eq(users.id, id)),
    ).map(() => undefined);
  }
}
