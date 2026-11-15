import { describe, expect, test } from "bun:test";
import { addRule, createLink, useSuite } from "./fixtures.ts";
import { linkApi, ok } from "./api.ts";

/**
 * Admin actions are recorded in the same transaction as the change: one
 * entry per change that happened, none for refused or no-op changes.
 */
const t = useSuite({ allowAll: false });
const api = () => linkApi(t.h);
const entries = () =>
  t.h.db.query.adminActions.findMany({
    // `created_at` has 1-second resolution: insertion order breaks ties.
    orderBy: (a, { asc, sql }) => [asc(a.createdAt), asc(sql`rowid`)],
  });
const audit = (query: Record<string, string> = {}) =>
  ok(t.h.request("GET", "/v1/admin/audit", { as: t.admin, query }));

describe("domain rule changes", () => {
  test("create, update and delete each write one entry", async () => {
    const id = await addRule(t.h, t.admin, "whitelist", "example.com");
    await ok(
      t.h.request("PATCH", `/v1/rules/${id}`, {
        as: t.admin,
        body: { list: "blacklist" },
      }),
    );
    await t.h.request("DELETE", `/v1/rules/${id}`, { as: t.admin });
    const rows = await entries();
    expect(rows.map((r) => r.action)).toEqual([
      "rule.create",
      "rule.update",
      "rule.delete",
    ]);
    expect(
      rows.every((r) => r.targetId === id && r.actorId === t.admin.id),
    ).toBe(true);
    expect(rows[0]!.details).toEqual({
      list: "whitelist",
      type: "domain",
      pattern: "example.com",
    });
    expect(rows[1]!.details).toEqual({
      list: { from: "whitelist", to: "blacklist" },
    });
    expect(rows[2]!.details).toMatchObject({ pattern: "example.com" });
  });

  test("a refused change writes nothing", async () => {
    await addRule(t.h, t.admin, "whitelist", "example.com");
    const dup = await t.h.request("POST", "/v1/rules", {
      as: t.admin,
      body: { list: "whitelist", pattern: "example.com" },
    });
    expect(dup.status).toBe(409);
    const bad = await t.h.request("POST", "/v1/rules", {
      as: t.admin,
      body: { list: "whitelist", pattern: "not a domain/" },
    });
    expect(bad.status).toBe(400);
    expect(
      (await t.h.request("DELETE", "/v1/rules/nope", { as: t.admin })).status,
    ).toBe(404);
    expect(await entries()).toHaveLength(1);
  });
});

describe("link changes", () => {
  test("an admin changing someone else's link is recorded with before and after", async () => {
    await addRule(t.h, t.admin, "whitelist", "*.example");
    const { code } = await createLink(t.h, t.owner, "https://a.example/old");
    await ok(
      api().update(code, t.admin, {
        url: "https://a.example/new",
        active: false,
        userId: t.other.id,
      }),
    );
    const entry = (await entries()).find((e) => e.action === "link.update");
    expect(entry).toMatchObject({ actorId: t.admin.id, targetType: "link" });
    expect(entry!.details).toEqual({
      code,
      url: { from: "https://a.example/old", to: "https://a.example/new" },
      active: { from: true, to: false },
      userId: { from: t.owner.id, to: t.other.id },
    });
  });

  test("owners editing their own links aren't recorded", async () => {
    await addRule(t.h, t.admin, "whitelist", "*.example");
    const { code } = await createLink(t.h, t.owner, "https://a.example");
    await ok(api().update(code, t.owner, { active: false }));
    const mine = await createLink(t.h, t.admin, "https://b.example");
    await ok(api().update(mine.code, t.admin, { active: false }));
    expect((await entries()).map((e) => e.action)).toEqual(["rule.create"]);
  });

  test("a refused admin change writes nothing", async () => {
    await addRule(t.h, t.admin, "whitelist", "a.example");
    const { code } = await createLink(t.h, t.owner, "https://a.example");
    const res = await api().update(code, t.admin, {
      url: "https://not-allowed.example",
    });
    expect(res.status).toBe(403);
    expect((await entries()).map((e) => e.action)).toEqual(["rule.create"]);
  });
});

describe("GET /v1/admin/audit", () => {
  test("newest first, with the admin, filterable", async () => {
    const id = await addRule(t.h, t.admin, "whitelist", "example.com");
    await t.h.request("POST", `/v1/admin/users/${t.owner.id}/suspension`, {
      as: t.admin,
      body: { reason: "spam" },
    });
    const all = await audit();
    expect(all.map((e: { action: string }) => e.action)).toEqual([
      "user.suspend",
      "rule.create",
    ]);
    expect(all[0]).toMatchObject({
      targetType: "user",
      targetId: t.owner.id,
      reason: "spam",
      actor: { id: t.admin.id },
    });
    expect(
      (await audit({ targetType: "rule", targetId: id })).map(
        (e: { action: string }) => e.action,
      ),
    ).toEqual(["rule.create"]);
    expect(await audit({ action: "user.restore" })).toEqual([]);
    expect(await audit({ actorId: t.owner.id })).toEqual([]);
  });

  test("admins only", async () => {
    expect(
      (await t.h.request("GET", "/v1/admin/audit", { as: t.owner })).status,
    ).toBe(403);
  });
});
