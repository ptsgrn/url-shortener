import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { createHarness, type Harness, type TestUser } from "./harness.ts";
import { eq } from "drizzle-orm";
import { links } from "../src/modules/links/schema.ts";
import { allowAll, createLink } from "./fixtures.ts";

let h: Harness;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.dispose());
beforeEach(async () => {
  await h.reset();
  alice = await h.signIn();
  bob = await h.signIn();
  await allowAll(h, await h.signIn({ role: "admin" }));
});

describe("GET /v1/links/:code: look up a link", () => {
  test("is public and returns only public fields", async () => {
    const { code } = await createLink(h, alice, "https://example.com/a");
    const res = await h.request("GET", `/v1/links/${code}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      code,
      url: "https://example.com/a",
      blocked: false,
      deactivatedAt: null,
      deactivatedReason: null,
      bannedAt: null,
      bannedReason: null,
    });
    // No owner or internal id leaks out of the public lookup.
    expect(res.body).not.toHaveProperty("userId");
    expect(res.body).not.toHaveProperty("id");
  });

  test("404s for an unknown code", async () => {
    const res = await h.request("GET", "/v1/links/nope123");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "LINK_NOT_FOUND" });
  });

  test("codes are case-sensitive", async () => {
    const { code } = await createLink(h, alice, "https://example.com");
    const flipped = code.replace(/[a-z]/, (c) => c.toUpperCase());
    if (flipped === code) return; // no lowercase letter to flip
    expect((await h.request("GET", `/v1/links/${flipped}`)).status).toBe(404);
  });

  test("still returns a deactivated link, with the reason", async () => {
    const { code } = await createLink(h, alice, "https://example.com");
    const at = new Date("2026-01-02T03:04:05.000Z");
    await h.db
      .update(links)
      .set({ deactivatedAt: at, deactivatedReason: "paused" })
      .where(eq(links.code, code));
    const res = await h.request("GET", `/v1/links/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.deactivatedAt).toBe(at.toISOString());
    expect(res.body.deactivatedReason).toBe("paused");
  });
});

describe("GET /v1/links: list my links", () => {
  test("requires a signed-in user", async () => {
    expect((await h.request("GET", "/v1/links")).status).toBe(401);
  });

  test("lists only the caller's links, newest first", async () => {
    const a1 = await createLink(h, alice, "https://example.com/1");
    await createLink(h, bob, "https://example.com/bob");
    const a2 = await createLink(h, alice, "https://example.com/2");
    const a3 = await createLink(h, alice, "https://example.com/3");

    const res = await h.request("GET", "/v1/links", { as: alice });
    expect(res.status).toBe(200);
    expect(res.body.map((l: { code: string }) => l.code)).toEqual([
      a3.code,
      a2.code,
      a1.code,
    ]);
  });

  test("returns the owner's view of each link", async () => {
    await createLink(h, alice, "https://example.com");
    const [link] = (await h.request("GET", "/v1/links", { as: alice })).body;
    expect(link).toEqual({
      id: expect.any(String),
      code: expect.any(String),
      url: "https://example.com",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      blocked: false,
      deactivatedAt: null,
      deactivatedReason: null,
      bannedAt: null,
      bannedReason: null,
    });
    expect(Number.isNaN(Date.parse(link.createdAt))).toBe(false);
  });

  test("is empty for a user with no links", async () => {
    const res = await h.request("GET", "/v1/links", { as: bob });
    expect(res.body).toEqual([]);
  });

  test("paginates with offset/limit without gaps or repeats", async () => {
    const made: string[] = [];
    for (let i = 0; i < 7; i++)
      made.unshift(
        (await createLink(h, alice, `https://example.com/${i}`)).code,
      );

    const seen: string[] = [];
    for (let offset = 0; offset < 8; offset += 3) {
      const res = await h.request("GET", "/v1/links", {
        as: alice,
        query: { offset: String(offset), limit: "3" },
      });
      expect(res.status).toBe(200);
      expect(res.body.length).toBeLessThanOrEqual(3);
      seen.push(...res.body.map((l: { code: string }) => l.code));
    }
    expect(seen).toEqual(made);
  });

  test("defaults to 20 per page", async () => {
    for (let i = 0; i < 21; i++)
      await createLink(h, alice, "https://example.com");
    const res = await h.request("GET", "/v1/links", { as: alice });
    expect(res.body).toHaveLength(20);
  });

  test.each([
    ["limit=0", { limit: "0" }],
    ["limit=101", { limit: "101" }],
    ["offset=-1", { offset: "-1" }],
    ["limit=abc", { limit: "abc" }],
  ])("rejects %s with 422", async (_, query) => {
    const res = await h.request("GET", "/v1/links", { as: alice, query });
    expect(res.status).toBe(422);
  });
});

describe("DELETE /v1/links/:code: delete my link", () => {
  test("requires a signed-in user", async () => {
    const { code } = await createLink(h, alice, "https://example.com");
    expect((await h.request("DELETE", `/v1/links/${code}`)).status).toBe(401);
  });

  test("the owner can delete it: 204, then it's gone everywhere", async () => {
    const { code } = await createLink(h, alice, "https://example.com");
    const res = await h.request("DELETE", `/v1/links/${code}`, { as: alice });
    expect(res.status).toBe(204);

    expect((await h.request("GET", `/v1/links/${code}`)).status).toBe(404);
    const list = await h.request("GET", "/v1/links", { as: alice });
    expect(list.body).toEqual([]);
  });

  test("is a soft delete: the row stays, with deletedAt set", async () => {
    const { code } = await createLink(h, alice, "https://example.com");
    await h.request("DELETE", `/v1/links/${code}`, { as: alice });
    const row = await h.db.query.links.findFirst({
      where: (l, { eq }) => eq(l.code, code),
    });
    expect(row).toBeDefined();
    expect(row!.deletedAt).toBeInstanceOf(Date);
  });

  test("someone else's link is 404 and is left untouched", async () => {
    const { code } = await createLink(h, alice, "https://example.com");
    const res = await h.request("DELETE", `/v1/links/${code}`, { as: bob });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "LINK_NOT_FOUND" });
    expect((await h.request("GET", `/v1/links/${code}`)).status).toBe(200);
  });

  test("deleting twice is 404 the second time", async () => {
    const { code } = await createLink(h, alice, "https://example.com");
    await h.request("DELETE", `/v1/links/${code}`, { as: alice });
    const res = await h.request("DELETE", `/v1/links/${code}`, { as: alice });
    expect(res.status).toBe(404);
  });

  test("an unknown code is 404", async () => {
    const res = await h.request("DELETE", "/v1/links/nope123", { as: alice });
    expect(res.status).toBe(404);
  });

  test("only the deleted link goes away", async () => {
    const keep = await createLink(h, alice, "https://example.com/keep");
    const drop = await createLink(h, alice, "https://example.com/drop");
    await h.request("DELETE", `/v1/links/${drop.code}`, { as: alice });
    const list = await h.request("GET", "/v1/links", { as: alice });
    expect(list.body.map((l: { code: string }) => l.code)).toEqual([keep.code]);
  });
});
