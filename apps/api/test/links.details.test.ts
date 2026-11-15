import { describe, expect, test } from "bun:test";
import { banLink, type LinkStatus, linkApi, SHORT_ORIGIN, ok } from "./api.ts";
import { addRule, createLink, useSuite } from "./fixtures.ts";

/**
 * FR-06: owners browse a list and details of the links they hold: short
 * link, destination, creation date and status, paginated. An empty list is
 * an empty state; deleted links aren't listed but keep their code.
 * (List basics, pagination and deletion live in links.crud.test.ts.)
 */
const t = useSuite();
const api = () => linkApi(t.h);

describe("FR-06: link details", () => {
  test.todo(
    "the owner gets the short link, destination, created date and status",
    async () => {
      const { code } = await createLink(
        t.h,
        t.owner,
        "https://example.com/page",
      );
      const res = await api().details(code, t.owner);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        code,
        shortUrl: `${SHORT_ORIGIN}/${code}`,
        url: "https://example.com/page",
        status: "active",
      });
      expect(Number.isNaN(Date.parse(res.body.createdAt))).toBe(false);
    },
  );

  test.todo("is 404 for a deleted link", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await ok(api().details(code, t.owner)); // control
    await t.h.request("DELETE", `/v1/links/${code}`, { as: t.owner });
    expect((await api().details(code, t.owner)).status).toBe(404);
  });

  test.todo("is 404 for an unknown code", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await ok(api().details(code, t.owner)); // control
    expect((await api().details("nope123", t.owner)).status).toBe(404);
  });
});

describe("FR-06: each link's status", () => {
  const statusOf = async (code: string): Promise<LinkStatus> =>
    (await ok(api().details(code, t.owner))).status;

  test.todo("active → disabled → active as the owner toggles it", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    expect(await statusOf(code)).toBe("active");
    await api().update(code, t.owner, { active: false });
    expect(await statusOf(code)).toBe("disabled");
    await api().update(code, t.owner, { active: true });
    expect(await statusOf(code)).toBe("active");
  });

  test.todo("banned when an admin suspends it", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await banLink(t.h, code);
    expect(await statusOf(code)).toBe("banned");
  });

  test.todo(
    "blocked when its destination fails the current FR-04 rules",
    async () => {
      const { code } = await createLink(t.h, t.owner, "https://example.com");
      await addRule(t.h, t.admin, "blacklist", "example.com");
      expect(await statusOf(code)).toBe("blocked");
    },
  );

  test.todo("the list shows the same status per link", async () => {
    const a = await createLink(t.h, t.owner, "https://example.com/a");
    const b = await createLink(t.h, t.owner, "https://example.com/b");
    await api().update(a.code, t.owner, { active: false });
    const { body } = await t.h.request("GET", "/v1/links", { as: t.owner });
    const byCode = Object.fromEntries(
      body.map((l: { code: string; status: LinkStatus }) => [l.code, l.status]),
    );
    expect(byCode).toEqual({ [a.code]: "disabled", [b.code]: "active" });
  });

  test.todo("the list includes each link's short URL", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const { body } = await t.h.request("GET", "/v1/links", { as: t.owner });
    expect(body[0].shortUrl).toBe(`${SHORT_ORIGIN}/${code}`);
  });
});
