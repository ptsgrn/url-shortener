import { describe, expect, test } from "bun:test";
import { banLink, banUser, LinkErrors, linkApi, ok } from "./api.ts";
import { addRule, createLink, useSuite } from "./fixtures.ts";

/**
 * FR-07: the owner changes a link's destination, keeping the short link
 * (and QR code). The new URL must pass FR-04, or the old one stays. Deleted
 * or admin-suspended links can't be edited, and the code can't be renamed.
 */
const t = useSuite();
const api = () => linkApi(t.h);
const lookup = async (code: string) =>
  (await t.h.request("GET", `/v1/links/${code}`)).body;

describe("FR-07: editing the destination", () => {
  test("the owner can change it; the code stays the same", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    const res = await api().update(code, t.owner, {
      url: "https://example.com/new",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code, url: "https://example.com/new" });
    expect((await lookup(code)).url).toBe("https://example.com/new");
  });

  test.todo("updates updatedAt but not createdAt", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    const before = (await api().details(code, t.owner)).body;
    await Bun.sleep(1100); // timestamps have 1-second resolution
    await api().update(code, t.owner, { url: "https://example.com/new" });
    const after = (await api().details(code, t.owner)).body;
    expect(after.createdAt).toBe(before.createdAt);
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(
      Date.parse(before.updatedAt),
    );
  });

  test("a new URL that fails FR-04 is refused and the old one kept", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    await addRule(t.h, t.admin, "blacklist", "evil.com");
    const res = await api().update(code, t.owner, {
      url: "https://evil.com",
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(LinkErrors.Blocked);
    expect((await lookup(code)).url).toBe("https://example.com/old");
  });

  test.each(["http://example.com", "javascript:alert(1)", "not a url"])(
    "an invalid new URL (%p) is refused and the old one kept",
    async (url) => {
      const { code } = await createLink(
        t.h,
        t.owner,
        "https://example.com/old",
      );
      const res = await api().update(code, t.owner, { url });
      expect(res.status).toBe(422);
      expect((await lookup(code)).url).toBe("https://example.com/old");
    },
  );

  test("the code can't be renamed", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await ok(api().update(code, t.owner, { url: "https://example.com/2" })); // control
    await api().update(code, t.owner, { code: "renamed" });
    expect((await t.h.request("GET", "/v1/links/renamed")).status).toBe(404);
    expect((await t.h.request("GET", `/v1/links/${code}`)).status).toBe(200);
  });

  test("a deleted link can't be edited", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    await ok(api().update(code, t.owner, { url: "https://example.com/old" })); // control
    await t.h.request("DELETE", `/v1/links/${code}`, { as: t.owner });
    const res = await api().update(code, t.owner, {
      url: "https://example.com/new",
    });
    expect(res.status).toBe(404);
    const row = await t.h.db.query.links.findFirst({
      where: (l, { eq }) => eq(l.code, code),
    });
    expect(row?.url).toBe("https://example.com/old");
  });

  test("an admin-suspended link can't be edited", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    await banLink(t.h, code);
    const res = await api().update(code, t.owner, {
      url: "https://example.com/new",
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: LinkErrors.Banned });
    expect((await lookup(code)).url).toBe("https://example.com/old");
  });

  test.todo(
    "a disabled link can still be edited (and stays disabled)",
    async () => {
      const { code } = await createLink(
        t.h,
        t.owner,
        "https://example.com/old",
      );
      await api().update(code, t.owner, { active: false });
      const res = await api().update(code, t.owner, {
        url: "https://example.com/new",
      });
      expect(res.status).toBe(200);
      expect((await api().details(code, t.owner)).body.status).toBe("disabled");
    },
  );

  test("someone else can't edit it (404, unchanged)", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    await ok(api().update(code, t.owner, { url: "https://example.com/old" })); // control
    const res = await api().update(code, t.other, {
      url: "https://example.com/new",
    });
    expect(res.status).toBe(404);
    expect((await lookup(code)).url).toBe("https://example.com/old");
  });
});

describe("updating: who may change what", () => {
  const ownerOf = async (code: string) =>
    (
      await t.h.db.query.links.findFirst({
        where: (l, { eq }) => eq(l.code, code),
        columns: { userId: true },
      })
    )?.userId;
  const listed = async (as: typeof t.owner) =>
    (await t.h.request("GET", "/v1/links", { as })).body.map(
      (l: { code: string }) => l.code,
    );

  test("an admin can move a link to another user", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const res = await api().update(code, t.admin, { userId: t.other.id });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(t.other.id);
    expect(await listed(t.other)).toContain(code);
    expect(await listed(t.owner)).not.toContain(code);
    // The new owner manages it; the old one no longer can.
    await ok(api().update(code, t.other, { active: false }));
    expect((await api().update(code, t.owner, { active: true })).status).toBe(
      404,
    );
  });

  test("a user can't change the owner, even of their own link", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const res = await api().update(code, t.owner, {
      userId: t.other.id,
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: LinkErrors.OwnerChangeForbidden });
    expect(await ownerOf(code)).toBe(t.owner.id);
  });

  test("moving to a user who doesn't exist is refused", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const res = await api().update(code, t.admin, {
      userId: "no-such-user",
    });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: LinkErrors.OwnerNotFound });
    expect(await ownerOf(code)).toBe(t.owner.id);
  });

  test("a refused change changes nothing (all or nothing)", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    await addRule(t.h, t.admin, "blacklist", "evil.com");
    const res = await api().update(code, t.admin, {
      url: "https://evil.com",
      active: false,
      userId: t.other.id,
    });
    expect(res.status).toBe(403);
    const row = await t.h.db.query.links.findFirst({
      where: (l, { eq }) => eq(l.code, code),
    });
    expect(row).toMatchObject({
      url: "https://example.com/old",
      deactivatedAt: null,
      userId: t.owner.id,
    });
  });

  test("an admin can change a suspended link; it stays suspended", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    await banLink(t.h, code);
    const res = await api().update(code, t.admin, {
      url: "https://example.com/new",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      url: "https://example.com/new",
      status: "banned",
    });
  });

  test("an admin's new destination still has to pass the domain rules", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await addRule(t.h, t.admin, "blacklist", "evil.com");
    const res = await api().update(code, t.admin, { url: "https://evil.com" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(LinkErrors.Blocked);
  });

  test("an admin gets 404 for a deleted link", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await t.h.request("DELETE", `/v1/links/${code}`, { as: t.owner });
    expect((await api().update(code, t.admin, { active: false })).status).toBe(
      404,
    );
  });

  test("an empty update is rejected", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    expect((await api().update(code, t.owner, {})).status).toBe(422);
  });

  test("needs a session, and an account that isn't suspended", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    expect(
      (await api().update(code, undefined, { active: false })).status,
    ).toBe(401);
    await banUser(t.h, t.owner.id);
    const res = await api().update(code, t.owner, { active: false });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "AUTH_FORBIDDEN" });
  });
});
