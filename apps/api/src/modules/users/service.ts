import { and, eq, isNull } from "drizzle-orm";
import { err, ok, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, type InternalError } from "../../utils/error.ts";
import { UserError, type UserModel } from "./model.ts";
import { users } from "./schema.ts";

export type Role = "user" | "admin";

const publicColumns = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  bannedAt: true,
} as const;

/** Soft-deleted accounts are gone: they can't sign in or be authorized. */
const active = (id: string) => and(eq(users.id, id), isNull(users.deletedAt));

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
        where: active(id),
        columns: publicColumns,
      }),
    ).andThen((user) => {
      if (!user) return err(UserError.NotFound);
      const { bannedAt, role, ...profile } = user;
      return ok({
        ...profile,
        role: role ?? "user",
        suspended: bannedAt !== null,
      });
    });
  }

  /** The user's role and ban state, for authorization; a deleted account is `NotFound`. */
  static access(
    db: DB,
    id: string,
  ): ResultAsync<
    { role: Role; banned: boolean },
    UserError.NotFound | InternalError.Database
  > {
    return dbQuery(() =>
      db.query.users.findFirst({
        where: active(id),
        columns: { role: true, bannedAt: true },
      }),
    ).andThen((user) =>
      user
        ? ok({ role: user.role ?? "user", banned: user.bannedAt != null })
        : err(UserError.NotFound),
    );
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
