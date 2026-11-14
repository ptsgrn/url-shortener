import { eq } from "drizzle-orm";
import type { DB } from "../../db/index.ts";
import type { UserModel } from "./model.ts";
import { users } from "./schema.ts";

const publicColumns = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
} as const;

export abstract class User {
  static async findById(db: DB, id: string): Promise<UserModel["user"] | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: publicColumns,
    });
    return user ?? null;
  }

  static async create(db: DB, profile: UserModel["profile"]): Promise<string> {
    const [user] = await db
      .insert(users)
      .values(profile)
      .returning({ id: users.id });
    return user!.id;
  }

  static async updateProfile(
    db: DB,
    id: string,
    profile: UserModel["profile"],
  ) {
    await db.update(users).set(profile).where(eq(users.id, id));
  }
}
