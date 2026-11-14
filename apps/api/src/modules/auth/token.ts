import { and, eq, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import type { DB } from "../../db/index.ts";
import { randomToken, sha256Hex } from "../../utils/crypto.ts";
import { refreshTokens } from "./schema.ts";

export const ACCESS_TOKEN_TTL = 15 * 60; // seconds
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // seconds

const key = (secret: string) => new TextEncoder().encode(secret);

/**
 * Access tokens are short-lived HS256 JWTs. Refresh tokens are opaque random
 * strings; only their SHA-256 hash is stored in `refresh_tokens`.
 */
export abstract class Token {
  static signAccess(secret: string, userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
      .sign(key(secret));
  }

  /** Returns the user id, or `null` if the token is missing, invalid or expired. */
  static async verifyAccess(
    secret: string,
    token: string | undefined,
  ): Promise<string | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, key(secret), {
        algorithms: ["HS256"],
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  /** Creates a refresh token for `userId`; returns its id and raw value. */
  static async issueRefresh(db: DB, userId: string) {
    const token = randomToken();
    const [row] = await db
      .insert(refreshTokens)
      .values({
        userId,
        tokenHash: await sha256Hex(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
      })
      .returning({ id: refreshTokens.id });
    return { id: row!.id, token };
  }

  /**
   * Exchanges a refresh token for a new one (rotation). Presenting a token that
   * was already rotated is treated as theft: every token of that user is revoked.
   */
  static async rotateRefresh(
    db: DB,
    token: string | undefined,
  ): Promise<{ userId: string; refreshToken: string } | null> {
    if (!token) return null;
    const row = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, await sha256Hex(token)),
    });
    if (!row) return null;

    if (row.revokedAt) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.userId, row.userId),
            isNull(refreshTokens.revokedAt),
          ),
        );
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now()) return null;

    // Revoke first, conditioned on still being active, so two concurrent
    // rotations of the same token cannot both succeed.
    const revoked = await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    if (revoked.length === 0) return null;

    const next = await Token.issueRefresh(db, row.userId);
    await db
      .update(refreshTokens)
      .set({ replacedBy: next.id })
      .where(eq(refreshTokens.id, row.id));
    return { userId: row.userId, refreshToken: next.token };
  }

  static async revokeRefresh(db: DB, token: string | undefined) {
    if (!token) return;
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, await sha256Hex(token)),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }
}
