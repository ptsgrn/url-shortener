import { describe, expect, test } from "bun:test";
import { banLink, LinkErrors, linkApi, ok } from "./api.ts";
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
  test.todo("the owner can change it; the code stays the same", async () => {
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

  test.todo(
    "a new URL that fails FR-04 is refused and the old one kept",
    async () => {
      const { code } = await createLink(
        t.h,
        t.owner,
        "https://example.com/old",
      );
      await addRule(t.h, t.admin, "blacklist", "evil.com");
      const res = await api().update(code, t.owner, {
        url: "https://evil.com",
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(LinkErrors.Blocked);
      expect((await lookup(code)).url).toBe("https://example.com/old");
    },
  );

  test.todo.each(["http://example.com", "javascript:alert(1)", "not a url"])(
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

  test.todo("the code can't be renamed", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await ok(api().update(code, t.owner, { url: "https://example.com/2" })); // control
    await api().update(code, t.owner, { code: "renamed" });
    expect((await t.h.request("GET", "/v1/links/renamed")).status).toBe(404);
    expect((await t.h.request("GET", `/v1/links/${code}`)).status).toBe(200);
  });

  test.todo("a deleted link can't be edited", async () => {
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

  test.todo("an admin-suspended link can't be edited", async () => {
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

  test.todo("someone else can't edit it (404, unchanged)", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/old");
    await ok(api().update(code, t.owner, { url: "https://example.com/old" })); // control
    const res = await api().update(code, t.other, {
      url: "https://example.com/new",
    });
    expect(res.status).toBe(404);
    expect((await lookup(code)).url).toBe("https://example.com/old");
  });
});
