import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { createHarness, type Harness, type TestUser } from "./harness.ts";
import { allowAll, CODE } from "./fixtures.ts";

let h: Harness;
let user: TestUser;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.dispose());
beforeEach(async () => {
  await h.reset();
  user = await h.signIn();
  await allowAll(h, await h.signIn({ role: "admin" }));
});

/** `as: null` sends no session. */
const create = (body: unknown, as: TestUser | null = user) =>
  h.request("POST", "/v1/links", { as: as ?? undefined, body });

describe("POST /v1/links: create a short link", () => {
  test("requires a signed-in user", async () => {
    const res = await create({ url: "https://example.com" }, null);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "AUTH_UNAUTHORIZED" });
  });

  test("rejects an invalid or expired access token", async () => {
    const res = await h.request("POST", "/v1/links", {
      as: { id: "x", cookie: "access_token=not-a-jwt" },
      body: { url: "https://example.com" },
    });
    expect(res.status).toBe(401);
  });

  test("returns a 7-character code and the destination", async () => {
    const res = await create({ url: "https://example.com/some/path?q=1#frag" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      code: expect.stringMatching(CODE),
      url: "https://example.com/some/path?q=1#frag",
      blocked: false,
      deactivatedAt: null,
      deactivatedReason: null,
      bannedAt: null,
      bannedReason: null,
    });
  });

  test("stores the link owned by the creator", async () => {
    const { body } = await create({ url: "https://example.com" });
    const row = await h.db.query.links.findFirst({
      where: (l, { eq }) => eq(l.code, body.code),
    });
    expect(row?.userId).toBe(user.id);
    expect(row?.deletedAt).toBeNull();
  });

  test("gives every link its own code, even for the same destination", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const res = await create({ url: "https://example.com" });
      expect(res.status).toBe(200);
      codes.add(res.body.code);
    }
    expect(codes.size).toBe(25);
  });

  describe("validates the destination URL", () => {
    test.each([
      ["missing", {}],
      ["empty", { url: "" }],
      ["not a URL", { url: "not a url" }],
      ["not a string", { url: 42 }],
    ])("rejects %s with 422", async (_, body) => {
      expect((await create(body)).status).toBe(422);
    });

    test.each([
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://example.com/file",
      "mailto:someone@example.com",
      "file:///etc/passwd",
    ])("only accepts https: rejects %s", async (url) => {
      const res = await create({ url });
      expect(res.status).toBe(422);
    });

    test("FR-04: only HTTPS, so plain http is rejected", async () => {
      expect((await create({ url: "http://example.com" })).status).toBe(422);
      expect((await create({ url: "HTTPS://example.com" })).status).toBe(200);
    });
  });
});
