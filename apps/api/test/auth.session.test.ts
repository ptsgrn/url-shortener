import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { refreshTokens } from "../src/modules/auth/schema.ts";
import { REFRESH_TOKEN_TTL } from "../src/modules/auth/token.ts";
import { refresh, refreshCookie } from "./api.ts";
import { useSuite } from "./fixtures.ts";

/**
 * FR-02: a session lasts until 7 days pass without use. Each refresh rotates
 * the token and starts a new 7-day window.
 */
const t = useSuite();
const DAY = 24 * 60 * 60 * 1000;

const age = (id: string, ms: number) =>
  t.h.db
    .update(refreshTokens)
    .set({ createdAt: new Date(Date.now() - ms) })
    .where(eq(refreshTokens.id, id));

describe("FR-02: sessions end after 7 days without use", () => {
  test("the refresh token lives 7 days", () => {
    expect(REFRESH_TOKEN_TTL).toBe(7 * 24 * 60 * 60);
  });

  test("a session used within 7 days is refreshed", async () => {
    const { id, cookie } = await refreshCookie(t.h, t.owner.id);
    await age(id, 6 * DAY);
    const res = await refresh(t.h, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("refresh_token=");
  });

  test("a session unused for 7 days is refused", async () => {
    const { id, cookie } = await refreshCookie(t.h, t.owner.id);
    await age(id, 7 * DAY + 1000);
    const res = await refresh(t.h, cookie);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "AUTH_REFRESH_TOKEN_EXPIRED" });
  });

  test("a token from before the change (30-day expiry) still ends after 7 days", async () => {
    const { id, cookie } = await refreshCookie(t.h, t.owner.id);
    await t.h.db
      .update(refreshTokens)
      .set({
        createdAt: new Date(Date.now() - 8 * DAY),
        expiresAt: new Date(Date.now() + 22 * DAY),
      })
      .where(eq(refreshTokens.id, id));
    expect((await refresh(t.h, cookie)).status).toBe(401);
  });

  test("each refresh starts a new 7-day window", async () => {
    const { id, cookie } = await refreshCookie(t.h, t.owner.id);
    await age(id, 6 * DAY);
    const res = await refresh(t.h, cookie);
    const next = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("refresh_token="))!
      .split(";")[0]!;
    const rotated = await t.h.db.query.refreshTokens.findFirst({
      where: (r, { isNull }) => isNull(r.revokedAt),
    });
    // The new token was just created, so it has a fresh 7 days.
    expect(Date.now() - rotated!.createdAt.getTime()).toBeLessThan(DAY);
    expect((await refresh(t.h, next)).status).toBe(200);
  });
});
