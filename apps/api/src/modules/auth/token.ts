import { and, eq, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { err, errAsync, ok, okAsync, ResultAsync, safeTry } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { randomToken, sha256Hex } from "../../utils/crypto.ts";
import { cryptoOp, dbQuery, InternalError } from "../../utils/error.ts";
import { AuthError, type RefreshError } from "./model.ts";
import { refreshTokens } from "./schema.ts";

export const ACCESS_TOKEN_TTL = 15 * 60; // seconds
/**
 * FR-02: a session ends after 7 days without use. Every refresh rotates the
 * token and starts a new 7-day window, so this is an inactivity limit, not a
 * maximum session length.
 */
export const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // seconds

const key = (secret: string) => new TextEncoder().encode(secret);
const hash = (token: string) => cryptoOp(() => sha256Hex(token));

/**
 * Access tokens are short-lived HS256 JWTs. Refresh tokens are opaque random
 * strings; only their SHA-256 hash is stored in `refresh_tokens`.
 */
export abstract class Token {
  static signAccess(
    secret: string,
    userId: string,
  ): ResultAsync<string, InternalError.Crypto> {
    return cryptoOp(() =>
      new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
        .sign(key(secret)),
    );
  }

  /** Resolves to the user id; any missing, invalid or expired token is `Unauthorized`. */
  static verifyAccess(
    secret: string,
    token: string | undefined,
  ): ResultAsync<string, AuthError.Unauthorized> {
    if (!token) return errAsync(AuthError.Unauthorized);
    return ResultAsync.fromPromise(
      jwtVerify(token, key(secret), { algorithms: ["HS256"] }),
      () => AuthError.Unauthorized as const,
    ).andThen(({ payload }) =>
      payload.sub ? ok(payload.sub) : err(AuthError.Unauthorized),
    );
  }

  /** Creates a refresh token for `userId`; returns its id and raw value. */
  static issueRefresh(
    db: DB,
    userId: string,
  ): ResultAsync<{ id: string; token: string }, InternalError> {
    const token = randomToken();
    return hash(token)
      .andThen((tokenHash) =>
        dbQuery(() =>
          db
            .insert(refreshTokens)
            .values({
              userId,
              tokenHash,
              expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
            })
            .returning({ id: refreshTokens.id })
            .get(),
        ),
      )
      .map((row) => ({ id: row!.id, token }));
  }

  /**
   * Exchanges a refresh token for a new one (rotation). Presenting a token that
   * was already rotated is treated as theft: every token of that user is revoked.
   */
  static rotateRefresh(
    db: DB,
    token: string | undefined,
  ): ResultAsync<
    { userId: string; refreshToken: string },
    RefreshError | InternalError
  > {
    return safeTry(async function* () {
      if (!token) return err(AuthError.InvalidRefreshToken);
      const tokenHash = yield* hash(token);
      const row = yield* dbQuery(() =>
        db.query.refreshTokens.findFirst({
          where: eq(refreshTokens.tokenHash, tokenHash),
        }),
      );
      if (!row) return err(AuthError.InvalidRefreshToken);

      if (row.revokedAt) {
        yield* dbQuery(() =>
          db
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(refreshTokens.userId, row.userId),
                isNull(refreshTokens.revokedAt),
              ),
            ),
        );
        return err(AuthError.RefreshTokenReused);
      }
      // Also by age: tokens issued before the TTL was shortened still carry
      // their longer `expiresAt`.
      if (
        row.expiresAt.getTime() <= Date.now() ||
        row.createdAt.getTime() + REFRESH_TOKEN_TTL * 1000 <= Date.now()
      )
        return err(AuthError.RefreshTokenExpired);

      // Revoke first, conditioned on still being active, so two concurrent
      // rotations of the same token cannot both succeed.
      const revoked = yield* dbQuery(() =>
        db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)),
          )
          .returning({ id: refreshTokens.id }),
      );
      if (revoked.length === 0) return err(AuthError.InvalidRefreshToken);

      const next = yield* Token.issueRefresh(db, row.userId);
      yield* dbQuery(() =>
        db
          .update(refreshTokens)
          .set({ replacedBy: next.id })
          .where(eq(refreshTokens.id, row.id)),
      );
      return ok({ userId: row.userId, refreshToken: next.token });
    });
  }

  static revokeRefresh(
    db: DB,
    token: string | undefined,
  ): ResultAsync<void, InternalError> {
    if (!token) return okAsync(undefined);
    return hash(token)
      .andThen((tokenHash) =>
        dbQuery(() =>
          db
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(refreshTokens.tokenHash, tokenHash),
                isNull(refreshTokens.revokedAt),
              ),
            ),
        ),
      )
      .map(() => undefined);
  }
}
