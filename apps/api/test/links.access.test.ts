import { describe, expect, test } from "bun:test";
import { banUser, deleteUser, linkApi, ok } from "./api.ts";
import { createLink, useSuite } from "./fixtures.ts";

/**
 * FR-01: only signed-in, non-suspended users reach link management.
 * FR-03: checked server-side on every request; users only see and manage
 * links they hold; visitors can only open links (and report).
 * FR-15: a suspended account is refused management access.
 */
const t = useSuite();

describe("FR-01 / FR-15: suspended accounts can't manage links", () => {
  test("can't create a link", async () => {
    await banUser(t.h, t.owner.id);
    const res = await t.h.request("POST", "/v1/links", {
      as: t.owner,
      body: { url: "https://example.com" },
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "AUTH_FORBIDDEN" });
  });

  test("can't list their links", async () => {
    await createLink(t.h, t.owner, "https://example.com");
    await banUser(t.h, t.owner.id);
    expect(
      (await t.h.request("GET", "/v1/links", { as: t.owner })).status,
    ).toBe(403);
  });

  test("can't delete their link, and it stays", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await banUser(t.h, t.owner.id);
    const res = await t.h.request("DELETE", `/v1/links/${code}`, {
      as: t.owner,
    });
    expect(res.status).toBe(403);
    expect((await t.h.request("GET", `/v1/links/${code}`)).status).toBe(200);
  });

  test("a token for a user that no longer exists is refused", async () => {
    const ghost = await t.h.signIn();
    await t.h.reset();
    const res = await t.h.request("GET", "/v1/links", { as: ghost });
    expect(res.status).toBe(401);
  });

  test.todo(
    "FR-07/08/10/11: edit, enable, QR and stats are refused too",
    async () => {
      const api = linkApi(t.h);
      const { code } = await createLink(t.h, t.owner, "https://example.com");
      await ok(api.details(code, t.owner)); // control
      await banUser(t.h, t.owner.id);
      for (const res of [
        await api.details(code, t.owner),
        await api.update(code, t.owner, { url: "https://example.com/new" }),
        await api.update(code, t.owner, { active: false }),
        await api.qr(code, t.owner),
        await api.stats(code, t.owner),
      ])
        expect(res.status).toBe(403);
    },
  );
});

describe("FR-03: users only see and manage links they hold", () => {
  test("visitors (signed out) can open a link's public lookup", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    expect((await t.h.request("GET", `/v1/links/${code}`)).status).toBe(200);
  });

  test("someone else's links never appear in my list", async () => {
    await createLink(t.h, t.owner, "https://example.com/mine");
    const res = await t.h.request("GET", "/v1/links", { as: t.other });
    expect(res.body).toEqual([]);
  });

  test.todo(
    "another user gets 404 and no data for details, edit, QR and stats",
    async () => {
      const api = linkApi(t.h);
      const { code } = await createLink(
        t.h,
        t.owner,
        "https://example.com/secret",
      );
      await ok(api.details(code, t.owner)); // control
      for (const res of [
        await api.details(code, t.other),
        await api.update(code, t.other, { url: "https://example.com/hijack" }),
        await api.update(code, t.other, { active: false }),
        await api.qr(code, t.other),
        await api.stats(code, t.other),
      ]) {
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body ?? "")).not.toContain("secret");
      }
      // Nothing was changed.
      const own = await api.details(code, t.owner);
      expect(own.body).toMatchObject({
        url: "https://example.com/secret",
        status: "active",
      });
    },
  );

  test.todo(
    "visitors (signed out) get 401 from every management route",
    async () => {
      const api = linkApi(t.h);
      const { code } = await createLink(t.h, t.owner, "https://example.com");
      await ok(api.details(code, t.owner)); // control
      for (const res of [
        await api.details(code),
        await api.update(code, undefined, { active: false }),
        await api.qr(code),
        await api.stats(code),
      ])
        expect(res.status).toBe(401);
    },
  );

  test("an admin can change any user's link (but it stays theirs)", async () => {
    const api = linkApi(t.h);
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const res = await api.update(code, t.admin, {
      url: "https://example.com/x",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      url: "https://example.com/x",
      userId: t.owner.id,
    });
  });
});

describe("soft-deleted accounts lose access, whatever their role", () => {
  test("a deleted admin can't manage rules", async () => {
    const add = () =>
      t.h.request("POST", "/v1/rules", {
        as: t.admin,
        body: { list: "blacklist", pattern: "evil.com" },
      });
    expect((await add()).status).toBe(201); // control
    await deleteUser(t.h, t.admin.id);
    const res = await add();
    expect(res.status).toBe(401);
    expect(
      (await t.h.request("GET", "/v1/rules", { as: t.admin })).status,
    ).toBe(401);
  });

  test("a deleted admin can't change other users' links", async () => {
    const api = linkApi(t.h);
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await ok(api.update(code, t.admin, { active: false })); // control
    await deleteUser(t.h, t.admin.id);
    const res = await api.update(code, t.admin, {
      active: true,
      userId: t.admin.id,
    });
    expect(res.status).toBe(401);
    const row = await t.h.db.query.links.findFirst({
      where: (l, { eq }) => eq(l.code, code),
    });
    expect(row?.userId).toBe(t.owner.id);
    expect(row?.deactivatedAt).not.toBeNull();
  });

  test("a deleted user can't create, list, change or delete links", async () => {
    const api = linkApi(t.h);
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await deleteUser(t.h, t.owner.id);
    const statuses = [
      (await api.create(t.owner, { url: "https://example.com" })).status,
      (await t.h.request("GET", "/v1/links", { as: t.owner })).status,
      (await api.update(code, t.owner, { active: false })).status,
      (await t.h.request("DELETE", `/v1/links/${code}`, { as: t.owner }))
        .status,
      (await api.stats(code, t.owner)).status,
    ];
    expect(statuses).toEqual([401, 401, 401, 401, 401]);
  });

  test("a deleted user isn't signed in", async () => {
    expect(
      (await t.h.request("GET", "/v1/auth/me", { as: t.owner })).status,
    ).toBe(200); // control
    await deleteUser(t.h, t.owner.id);
    expect(
      (await t.h.request("GET", "/v1/auth/me", { as: t.owner })).status,
    ).toBe(401);
  });
});
