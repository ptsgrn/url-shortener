import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { links } from "../src/modules/links/schema.ts";
import { users } from "../src/modules/users/schema.ts";
import { addRule, createLink, useSuite } from "./fixtures.ts";
import { banLink, linkApi, ok } from "./api.ts";

/** FR-03: admins see every user's links, with their owner, and their stats. */
const t = useSuite();
const api = () => linkApi(t.h);
const list = async (query: Record<string, string> = {}) =>
  ok(t.h.request("GET", "/v1/admin/links", { as: t.admin, query }));
const codes = async (query: Record<string, string> = {}) =>
  (await list(query)).map((l: { code: string }) => l.code);

describe("GET /v1/admin/links", () => {
  test("lists everyone's links, newest first, with the owner", async () => {
    await t.h.db
      .update(users)
      .set({ email: "o@uni.example" })
      .where(eq(users.id, t.owner.id));
    const a = await createLink(t.h, t.owner, "https://example.com/a");
    const b = await createLink(t.h, t.other, "https://example.com/b");
    const body = await list();
    expect(body.map((l: { code: string }) => l.code)).toEqual([b.code, a.code]);
    expect(body[1]).toMatchObject({
      code: a.code,
      url: "https://example.com/a",
      status: "active",
      deletedAt: null,
      owner: { id: t.owner.id, email: "o@uni.example" },
    });
  });

  test("filters by q (code or URL) and owner", async () => {
    await api().create(t.owner, {
      url: "https://example.com/x",
      code: "open-day",
    });
    const b = await createLink(t.h, t.other, "https://example.com/special");
    expect(await codes({ q: "open-day" })).toEqual(["open-day"]);
    expect(await codes({ q: "special" })).toEqual([b.code]);
    expect(await codes({ ownerId: t.other.id })).toEqual([b.code]);
  });

  test("filters by status", async () => {
    await api().create(t.owner, { url: "https://example.com", code: "live" });
    await api().create(t.owner, { url: "https://example.com", code: "off" });
    await api().update("off", t.owner, { active: false });
    await api().create(t.owner, { url: "https://example.com", code: "ban" });
    await banLink(t.h, "ban");
    await api().create(t.owner, { url: "https://later.example", code: "blk" });
    await addRule(t.h, t.admin, "blacklist", "later.example");
    expect(await codes({ status: "active" })).toEqual(["live"]);
    expect(await codes({ status: "disabled" })).toEqual(["off"]);
    expect(await codes({ status: "banned" })).toEqual(["ban"]);
    expect(await codes({ status: "blocked" })).toEqual(["blk"]);
  });

  test("active/blocked filter before paging: an empty page means no more", async () => {
    // One older active link, one newer blocked one.
    await api().create(t.owner, {
      url: "https://ok.example",
      code: "older-ok",
    });
    await Bun.sleep(1100); // created_at has 1-second resolution
    await api().create(t.owner, {
      url: "https://bad.example",
      code: "newer-bad",
    });
    await addRule(t.h, t.admin, "blacklist", "bad.example");
    const page = (status: string, offset: number) =>
      codes({ status, limit: "1", offset: String(offset) });
    expect(await page("active", 0)).toEqual(["older-ok"]);
    expect(await page("active", 1)).toEqual([]);
    expect(await page("blocked", 0)).toEqual(["newer-bad"]);
    expect(await page("blocked", 1)).toEqual([]);
  });

  test("paging active/blocked is exact across many links", async () => {
    // 450 links, newest first p000…p449; every third one is blocked.
    const base = Date.now();
    const rows = Array.from({ length: 450 }, (_, i) => ({
      code: `p${String(i).padStart(3, "0")}`,
      url: i % 3 === 0 ? "https://bad.example" : "https://ok.example",
      userId: t.owner.id,
      createdAt: new Date(base - i * 1000),
      updatedAt: new Date(base - i * 1000),
    }));
    // D1 allows 100 bound parameters per query: 15 rows of 6 at a time.
    for (let i = 0; i < rows.length; i += 15)
      await t.h.db.insert(links).values(rows.slice(i, i + 15));
    await addRule(t.h, t.admin, "blacklist", "bad.example");

    const all = async (status: string, limit: number) => {
      const seen: string[] = [];
      for (let offset = 0; ; offset += limit) {
        const page = await codes({
          status,
          limit: String(limit),
          offset: String(offset),
        });
        seen.push(...page);
        if (page.length < limit) return seen;
        expect(page).toHaveLength(limit);
      }
    };
    const expected = (blocked: boolean) =>
      rows.filter((_, i) => (i % 3 === 0) === blocked).map((r) => r.code);
    expect(await all("blocked", 40)).toEqual(expected(true));
    expect(await all("active", 100)).toEqual(expected(false));
    // An offset past the end is empty.
    expect(await codes({ status: "active", offset: "1000" })).toEqual([]);
  });

  test("deleted links only with deleted=true", async () => {
    const kept = await createLink(t.h, t.owner, "https://example.com/1");
    const gone = await createLink(t.h, t.owner, "https://example.com/2");
    await t.h.request("DELETE", `/v1/links/${gone.code}`, { as: t.owner });
    expect(await codes()).toEqual([kept.code]);
    const deleted = await list({ deleted: "true" });
    expect(deleted.map((l: { code: string }) => l.code)).toEqual([gone.code]);
    expect(deleted[0].deletedAt).not.toBeNull();
  });

  test("admins only", async () => {
    const res = await t.h.request("GET", "/v1/admin/links", { as: t.owner });
    expect(res.status).toBe(403);
  });
});

describe("FR-03: admins see any link's stats", () => {
  test("an admin can read someone else's stats; other users can't", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await api().visit(code);
    expect((await ok(api().stats(code, t.admin))).total).toBe(1);
    expect((await api().stats(code, t.other)).status).toBe(404);
  });

  test("not for a deleted link", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await t.h.request("DELETE", `/v1/links/${code}`, { as: t.owner });
    expect((await api().stats(code, t.admin)).status).toBe(404);
  });
});
