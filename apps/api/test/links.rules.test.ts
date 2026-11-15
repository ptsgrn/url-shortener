import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { createHarness, type Harness, type TestUser } from "./harness.ts";
import { addRule, createLink, removeRule } from "./fixtures.ts";

/**
 * FR-14: a destination is allowed only if its host matches at least one
 * whitelist rule and no blacklist rule (a host on both is rejected). Rules
 * apply to creating links and to opening existing ones; a link that fails
 * stops redirecting but keeps its code.
 */
let h: Harness;
let user: TestUser;
let admin: TestUser;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.dispose());
beforeEach(async () => {
  await h.reset();
  user = await h.signIn();
  admin = await h.signIn({ role: "admin" });
});

const create = (url: string) =>
  h.request("POST", "/v1/links", { as: user, body: { url } });

const expectBlocked = async (url: string) => {
  const res = await create(url);
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: "LINK_BLOCKED" });
};
const expectAllowed = async (url: string) => {
  const res = await create(url);
  expect(res.status).toBe(200);
  expect(res.body.blocked).toBe(false);
};

describe("creating a link (FR-14)", () => {
  test("with no whitelist rules at all, every destination is rejected", async () => {
    await expectBlocked("https://example.com");
  });

  test("a host on no whitelist is rejected", async () => {
    await addRule(h, admin, "whitelist", "example.com");
    await expectAllowed("https://example.com");
    await expectBlocked("https://other.com");
  });

  test("a blacklisted host is rejected", async () => {
    await addRule(h, admin, "whitelist", ".*", "regex");
    await addRule(h, admin, "blacklist", "evil.com");
    await expectBlocked("https://evil.com/anything");
    await expectAllowed("https://fine.com");
  });

  test("a host on both lists is rejected", async () => {
    await addRule(h, admin, "whitelist", "both.com");
    await addRule(h, admin, "blacklist", "both.com");
    await expectBlocked("https://both.com");
  });

  test("matching ignores host case, a trailing dot, path, query and port", async () => {
    await addRule(h, admin, "whitelist", "example.com");
    await expectAllowed("https://EXAMPLE.com");
    await expectAllowed("https://example.com./x");
    await expectAllowed("https://example.com:8443/a/b?c=d#e");
  });

  test("an exact domain rule does not cover subdomains", async () => {
    await addRule(h, admin, "whitelist", "example.com");
    await expectBlocked("https://www.example.com");
  });

  test("`*.domain` covers subdomains at any depth, but not the domain itself", async () => {
    await addRule(h, admin, "whitelist", "*.example.com");
    await expectAllowed("https://www.example.com");
    await expectAllowed("https://a.b.c.example.com");
    await expectBlocked("https://example.com");
    await expectBlocked("https://notexample.com");
  });

  test("a blacklisted subdomain wins over a whitelisted parent wildcard", async () => {
    await addRule(h, admin, "whitelist", "*.example.com");
    await addRule(h, admin, "blacklist", "evil.example.com");
    await expectAllowed("https://good.example.com");
    await expectBlocked("https://evil.example.com");
  });

  test("regex rules match the whole host, case-insensitively", async () => {
    await addRule(h, admin, "whitelist", "(www|m)\\.example\\.com", "regex");
    await expectAllowed("https://www.example.com");
    await expectAllowed("https://M.EXAMPLE.COM");
    // Anchored: a partial match isn't enough.
    await expectBlocked("https://www.example.com.attacker.net");
    await expectBlocked("https://xwww.example.com");
  });

  test("a regex blacklist rule blocks matching hosts", async () => {
    await addRule(h, admin, "whitelist", "*.example.com");
    await addRule(h, admin, "blacklist", ".*casino.*", "regex");
    await expectBlocked("https://casino.example.com");
    await expectAllowed("https://shop.example.com");
  });

  test("FR-04: matches the parsed hostname, never the URL text", async () => {
    await addRule(h, admin, "whitelist", "example.com");
    // The spec's own example: a lookalike suffix isn't the domain.
    await expectBlocked("https://example.com.evil.test");
    // The whitelisted name elsewhere in the URL doesn't count either.
    await expectBlocked("https://evil.test/example.com");
    await expectBlocked("https://evil.test/?next=https://example.com");
    await expectBlocked("https://example.com@evil.test/");
    await expectBlocked("https://evil-example.com");
  });

  test.todo(
    "FR-04: a refusal says why (blacklisted vs. not whitelisted)",
    async () => {
      await addRule(h, admin, "whitelist", "example.com");
      await addRule(h, admin, "blacklist", "bad.example.com");
      expect((await create("https://other.com")).body).toEqual({
        error: "LINK_BLOCKED",
        reason: "not_whitelisted",
      });
      expect((await create("https://bad.example.com")).body).toEqual({
        error: "LINK_BLOCKED",
        reason: "blacklisted",
      });
    },
  );

  test("an IP-address destination follows the same rules", async () => {
    await addRule(h, admin, "whitelist", "*.example.com");
    await expectBlocked("https://127.0.0.1/admin");
  });
});

describe("existing links follow the current rules (FR-14)", () => {
  test("blacklisting a host blocks its existing links, but keeps their codes", async () => {
    await addRule(h, admin, "whitelist", ".*", "regex");
    const { code } = await createLink(h, user, "https://later.com/x");

    const black = await addRule(h, admin, "blacklist", "later.com");
    const open = await h.request("GET", `/v1/links/${code}`);
    expect(open.status).toBe(200); // still reserved, not 404
    expect(open.body.blocked).toBe(true);

    const list = await h.request("GET", "/v1/links", { as: user });
    expect(list.body[0]).toMatchObject({ code, blocked: true });

    await removeRule(h, admin, black);
    const again = await h.request("GET", `/v1/links/${code}`);
    expect(again.body.blocked).toBe(false);
  });

  test("removing the only matching whitelist rule blocks existing links", async () => {
    const white = await addRule(h, admin, "whitelist", "example.com");
    const { code } = await createLink(h, user, "https://example.com");
    await removeRule(h, admin, white);
    expect((await h.request("GET", `/v1/links/${code}`)).body.blocked).toBe(
      true,
    );
  });

  test("changing a rule's list applies on the next check (cached regexes refresh)", async () => {
    await addRule(h, admin, "whitelist", "*.example.com");
    const id = await addRule(
      h,
      admin,
      "whitelist",
      "x\\.example\\.com",
      "regex",
    );
    const { code } = await createLink(h, user, "https://x.example.com");

    const res = await h.request("PATCH", `/v1/rules/${id}`, {
      as: admin,
      body: { list: "blacklist" },
    });
    expect(res.status).toBe(200);
    expect((await h.request("GET", `/v1/links/${code}`)).body.blocked).toBe(
      true,
    );
  });

  test("a blocked link's code is not handed out again", async () => {
    await addRule(h, admin, "whitelist", ".*", "regex");
    const { code } = await createLink(h, user, "https://gone.com");
    await addRule(h, admin, "blacklist", "gone.com");
    for (let i = 0; i < 20; i++) {
      const { code: fresh } = await createLink(h, user, "https://ok.com");
      expect(fresh).not.toBe(code);
    }
  });

  test.todo(
    "rules apply when a link's destination is edited (no edit endpoint yet)",
  );
});
