import { describe, expect, test } from "bun:test";
import { banUser, linkApi, ok } from "./api.ts";
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

  test.todo(
    "an admin's role doesn't make them the owner of a user's link",
    async () => {
      // Admin moderation goes through FR-13 routes, not the owner's.
      const api = linkApi(t.h);
      const { code } = await createLink(t.h, t.owner, "https://example.com");
      await ok(api.update(code, t.owner, { url: "https://example.com/y" })); // control
      const res = await api.update(code, t.admin, {
        url: "https://example.com/x",
      });
      expect(res.status).toBe(404);
    },
  );
});
