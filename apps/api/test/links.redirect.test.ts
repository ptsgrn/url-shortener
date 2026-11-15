import { describe, expect, test } from "bun:test";
import { banLink, banUser, isRedirect, linkApi } from "./api.ts";
import { addRule, createLink, useSuite } from "./fixtures.ts";

/**
 * FR-09: anyone opens https://chula.me/{code} (or scans its QR) without
 * signing in. It redirects only if the link is active, not deleted or
 * suspended, its owner isn't suspended, and the destination passes FR-04
 * now. Otherwise: a status page, no redirect, and no counted visit.
 * Failing to record stats must not break a valid redirect.
 */
const t = useSuite();
const api = () => linkApi(t.h);

const expectRedirectTo = async (code: string, url: string) => {
  const res = await api().visit(code);
  expect(isRedirect(res.status)).toBe(true);
  expect(res.headers.get("location")).toBe(url);
};
/**
 * Control: link `code` redirects right now. Every "doesn't redirect" test
 * calls it before the change under test, so it can't pass vacuously.
 */
const redirectsNow = async (code: string) => {
  expect(isRedirect((await api().visit(code)).status)).toBe(true);
};
const expectNoRedirect = async (code: string, status?: number) => {
  const res = await api().visit(code);
  expect(isRedirect(res.status)).toBe(false);
  expect(res.headers.get("location")).toBeNull();
  if (status) expect(res.status).toBe(status);
  return res;
};

describe("FR-09: opening a short link", () => {
  test.todo("redirects a signed-out visitor to the destination", async () => {
    const { code } = await createLink(
      t.h,
      t.owner,
      "https://example.com/a?b=c#d",
    );
    await expectRedirectTo(code, "https://example.com/a?b=c#d");
  });

  test.todo(
    "uses a temporary redirect, so edits and rule changes take effect",
    async () => {
      // 301/308 are cached by browsers and would bypass FR-04/FR-08 checks.
      const { code } = await createLink(t.h, t.owner, "https://example.com");
      expect([302, 307]).toContain((await api().visit(code)).status);
    },
  );

  test.todo(
    "follows the current destination after an edit (FR-07)",
    async () => {
      const { code } = await createLink(
        t.h,
        t.owner,
        "https://example.com/old",
      );
      await api().update(code, t.owner, { url: "https://example.com/new" });
      await expectRedirectTo(code, "https://example.com/new");
    },
  );

  test.todo("an unknown code shows a 404 status page", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await redirectsNow(code); // control
    await expectNoRedirect("nope123", 404);
  });

  test.todo("a disabled link doesn't redirect (FR-08)", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await redirectsNow(code);
    await api().update(code, t.owner, { active: false });
    await expectNoRedirect(code);
  });

  test.todo("a deleted link doesn't redirect (FR-08)", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await redirectsNow(code);
    await t.h.request("DELETE", `/v1/links/${code}`, { as: t.owner });
    await expectNoRedirect(code);
  });

  test.todo("an admin-suspended link doesn't redirect (FR-13)", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await redirectsNow(code);
    await banLink(t.h, code);
    await expectNoRedirect(code);
  });

  test.todo("a suspended owner's links don't redirect (FR-15)", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await redirectsNow(code);
    await banUser(t.h, t.owner.id);
    await expectNoRedirect(code);
  });

  test.todo(
    "a destination now blacklisted doesn't redirect (FR-04, FR-14)",
    async () => {
      const { code } = await createLink(t.h, t.owner, "https://later.com");
      await redirectsNow(code);
      await addRule(t.h, t.admin, "blacklist", "later.com");
      await expectNoRedirect(code);
    },
  );

  test.todo(
    "a destination no longer whitelisted doesn't redirect",
    async () => {
      await t.h.reset();
      const owner = await t.h.signIn();
      const admin = await t.h.signIn({ role: "admin" });
      const white = await addRule(t.h, admin, "whitelist", "example.com");
      const { code } = await createLink(t.h, owner, "https://example.com");
      await redirectsNow(code);
      await t.h.request("DELETE", `/v1/rules/${white}`, { as: admin });
      await expectNoRedirect(code);
    },
  );

  test.todo(
    "the status page says why, without leaking the destination",
    async () => {
      const { code } = await createLink(
        t.h,
        t.owner,
        "https://example.com/private",
      );
      await redirectsNow(code);
      await banLink(t.h, code);
      const res = await expectNoRedirect(code);
      expect(JSON.stringify(res.body ?? "")).not.toContain(
        "example.com/private",
      );
    },
  );

  test.todo(
    "FR-02: opening a link doesn't refresh the visitor's session",
    async () => {
      const { code } = await createLink(t.h, t.owner, "https://example.com");
      await redirectsNow(code);
      const res = await t.h.request("GET", `/v1/r/${code}`, {
        as: t.owner,
      });
      expect(res.headers.get("set-cookie")).toBeNull();
    },
  );

  test.todo(
    "a failure recording the visit (FR-11) still redirects (needs an injectable visit recorder)",
  );
});
