import { describe, expect, test } from "bun:test";
import {
  banLink,
  LinkErrors,
  linkApi,
  SHORT_ORIGIN,
  SYSTEM_PATHS,
  ok,
} from "./api.ts";
import { CODE, createLink, useSuite } from "./fixtures.ts";

/**
 * FR-05: create a short link from an FR-04-valid URL and a code never used
 * before. A user-chosen code that's taken or invalid must be refused; a
 * random one is redrawn. Concurrent creates of one code: only one wins.
 * FR-08: a deleted code can't be created again, even by its old owner.
 */
const t = useSuite();
const api = () => linkApi(t.h);

/** Control: custom codes are supported at all (else refusals pass vacuously). */
const customCodesWork = async () => {
  const body = await ok(
    api().create(t.owner, { url: "https://example.com", code: "control-code" }),
  );
  expect(body.code).toBe("control-code");
};

describe("FR-05: the short link", () => {
  test.todo("is returned as https://chula.me/{code}", async () => {
    const res = await api().create(t.owner, { url: "https://example.com" });
    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(CODE);
    expect(res.body.shortUrl).toBe(`${SHORT_ORIGIN}/${res.body.code}`);
  });

  test("starts out active", async () => {
    const link = await createLink(t.h, t.owner, "https://example.com");
    const { body } = await t.h.request("GET", `/v1/links/${link.code}`);
    expect(body).toMatchObject({
      blocked: false,
      deactivatedAt: null,
      bannedAt: null,
    });
  });
});

describe("FR-05: a code the user chooses", () => {
  test("is used as given", async () => {
    const res = await api().create(t.owner, {
      url: "https://example.com",
      code: "eng-open-house",
    });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("eng-open-house");
    expect((await t.h.request("GET", "/v1/links/eng-open-house")).status).toBe(
      200,
    );
  });

  test.each([
    ["has a space", "a b"],
    ["has a slash", "a/b"],
    ["is a path traversal", "../admin"],
    ["has a query", "a?b=1"],
    ["has a dot", "a.b.c"],
    ["has a percent sign", "a%20b"],
    ["has a tilde", "a~bc"],
    ["has a non-ASCII letter", "ลิงก์ไทย"],
    ["has an emoji", "go🙂go"],
    ["is empty", ""],
    ["is too short (2)", "ab"],
    ["is too long (33)", "x".repeat(33)],
  ])("is refused when it %s", async (_, code) => {
    await customCodesWork();
    const res = await api().create(t.owner, {
      url: "https://example.com",
      code,
    });
    expect(res.status).toBe(422);
    expect(await t.h.db.query.links.findMany()).toHaveLength(1); // the control
  });

  test.each([
    "abc",
    "x".repeat(32),
    "ABCxyz019",
    "a-b_c+d",
    "+++",
    "--start",
    "_under_",
  ])("accepts %p (letters, digits, - + _; 3–32 long)", async (code) => {
    const body = await ok(
      api().create(t.owner, { url: "https://example.com", code }),
    );
    expect(body.code).toBe(code);
  });

  test("is case-sensitive: Open and open are different codes", async () => {
    await ok(api().create(t.owner, { url: "https://a.example", code: "Open" }));
    await ok(api().create(t.other, { url: "https://b.example", code: "open" }));
    expect((await t.h.request("GET", "/v1/links/Open")).body.url).toBe(
      "https://a.example",
    );
    expect((await t.h.request("GET", "/v1/links/open")).body.url).toBe(
      "https://b.example",
    );
  });

  test("a code with + works in URLs, raw or percent-encoded", async () => {
    await ok(
      api().create(t.owner, { url: "https://example.com", code: "c++" }),
    );
    for (const path of ["c++", "c%2B%2B"]) {
      expect((await t.h.request("GET", `/v1/links/${path}`)).status).toBe(200);
      const visit = await t.h.request("GET", `/v1/r/${path}`);
      expect(visit.status).toBe(302);
    }
  });

  test.each(SYSTEM_PATHS)(
    "is refused when it is the system path %p",
    async (code) => {
      await customCodesWork();
      const res = await api().create(t.owner, {
        url: "https://example.com",
        code,
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: LinkErrors.CodeTaken });
    },
  );

  test("is refused when an active link already has it", async () => {
    await api().create(t.owner, { url: "https://example.com", code: "taken" });
    const res = await api().create(t.other, {
      url: "https://example.org",
      code: "taken",
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: LinkErrors.CodeTaken });
    // The existing link is untouched.
    const { body } = await t.h.request("GET", "/v1/links/taken");
    expect(body.url).toBe("https://example.com");
  });

  test("is refused when a disabled link has it", async () => {
    await api().create(t.owner, { url: "https://example.com", code: "paused" });
    await api().update("paused", t.owner, { active: false });
    const res = await api().create(t.other, {
      url: "https://example.org",
      code: "paused",
    });
    expect(res.status).toBe(409);
  });

  test("is refused when an admin-suspended link has it", async () => {
    await api().create(t.owner, { url: "https://example.com", code: "banned" });
    await banLink(t.h, "banned");
    const res = await api().create(t.other, {
      url: "https://example.org",
      code: "banned",
    });
    expect(res.status).toBe(409);
  });

  test("FR-08: a deleted code can't be created again, even by its old owner", async () => {
    await api().create(t.owner, { url: "https://example.com", code: "gone" });
    await t.h.request("DELETE", "/v1/links/gone", { as: t.owner });
    for (const as of [t.owner, t.other]) {
      const res = await api().create(as, {
        url: "https://example.com",
        code: "gone",
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: LinkErrors.CodeTaken });
    }
  });

  test("concurrent creates with the same code: exactly one succeeds", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        api().create(i % 2 ? t.owner : t.other, {
          url: `https://example.com/${i}`,
          code: "race",
        }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    const rows = await t.h.db.query.links.findMany({
      where: (l, { eq }) => eq(l.code, "race"),
    });
    expect(rows).toHaveLength(1);
  });

  test("is still checked against FR-04 (a good code doesn't bypass the rules)", async () => {
    await t.h.request("POST", "/v1/rules", {
      as: t.admin,
      body: { list: "blacklist", pattern: "evil.com" },
    });
    const res = await api().create(t.owner, {
      url: "https://evil.com",
      code: "nice-name",
    });
    expect(res.status).toBe(403);
    // A refused create doesn't reserve the code.
    const ok = await api().create(t.owner, {
      url: "https://example.com",
      code: "nice-name",
    });
    expect(ok.status).toBe(200);
  });
});
