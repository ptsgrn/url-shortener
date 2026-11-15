import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { emailAllowed, parseDomains } from "../src/modules/auth/policy.ts";
import {
  providers,
  type OAuthProfile,
} from "../src/modules/auth/providers/index.ts";
import { banUser, deleteUser } from "./api.ts";
import { createHarness, type Harness } from "./harness.ts";

/**
 * FR-01: only allowed people sign in, and suspended (FR-15) or deleted
 * accounts get no session. Driven through the real OAuth routes with a fake
 * provider whose profile each test chooses.
 */
let profile: OAuthProfile;
beforeAll(() => {
  providers.fake = () => ({
    createAuthorizationURL: (state) =>
      new URL(`https://idp.example/authorize?state=${state}`),
    getProfile: async () => profile,
  });
});
afterAll(() => {
  delete providers.fake;
});

/** Starts sign-in, then completes the callback with the state cookies. */
const signIn = async (h: Harness, as: OAuthProfile) => {
  profile = as;
  const start = await h.request("GET", "/v1/auth/fake");
  expect(start.status).toBe(302);
  const jar = start.headers.getSetCookie().map((c) => c.split(";")[0]!);
  const state = jar.find((c) => c.startsWith("oauth_state="))!.split("=")[1]!;
  const res = await h.request("GET", "/v1/auth/fake/callback", {
    query: { code: "code", state },
    headers: { cookie: jar.join("; ") },
  });
  const session = res.headers
    .getSetCookie()
    .some(
      (c) => c.startsWith("access_token=") && !c.startsWith("access_token=;"),
    );
  return { ...res, session };
};

const person = (
  email: string,
  emailVerified = true,
  id = email,
): OAuthProfile => ({ id, email, emailVerified, name: "Someone" });

const usersNamed = (h: Harness, email: string) =>
  h.db.query.users.findMany({ where: (u, { eq }) => eq(u.email, email) });

describe("policy", () => {
  test("parseDomains trims, lowercases and drops empties and @", () => {
    expect(parseDomains(" Uni.Example , @staff.example,,")).toEqual([
      "uni.example",
      "staff.example",
    ]);
    expect(parseDomains(undefined)).toEqual([]);
    expect(parseDomains("")).toEqual([]);
  });

  test.each([
    ["a@uni.example", true, true],
    ["A@UNI.EXAMPLE", true, true],
    ["a@uni.example", false, false], // not verified
    ["a@cs.uni.example", true, false], // subdomain not listed
    ["a@evil-uni.example", true, false],
    ["a@uni.example.evil", true, false],
    ["uni.example", true, false], // no @
    ["a@other.example", true, false],
  ])("%s (verified: %p) → %p", (email, verified, allowed) => {
    expect(
      emailAllowed({ email, emailVerified: verified }, ["uni.example"]),
    ).toBe(allowed);
  });

  test("with no allowlist, anyone is allowed", () => {
    expect(emailAllowed({ email: undefined }, [])).toBe(true);
  });
});

describe("FR-01: email domain allowlist", () => {
  test("unset: anyone the provider signs in gets a session", async () => {
    const h = await createHarness();
    const res = await signIn(h, person("x@anywhere.example", false));
    expect(res.status).toBe(302);
    expect(res.session).toBe(true);
  });

  test("an allowed, verified email signs in", async () => {
    const h = await createHarness({
      env: { ALLOWED_EMAIL_DOMAINS: "uni.example, staff.example" },
    });
    for (const email of ["a@uni.example", "B@Staff.Example"]) {
      const res = await signIn(h, person(email));
      expect(res.status).toBe(302);
      expect(res.session).toBe(true);
    }
  });

  test.each([
    ["another domain", person("a@other.example")],
    ["an unverified email", person("a@uni.example", false)],
    ["no email", { id: "no-email", name: "Nobody" }],
  ])("refuses %s, and creates no account", async (_, who) => {
    const h = await createHarness({
      env: { ALLOWED_EMAIL_DOMAINS: "uni.example" },
    });
    const res = await signIn(h, who);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "AUTH_EMAIL_NOT_ALLOWED" });
    expect(res.session).toBe(false);
    expect(await h.db.query.users.findMany()).toHaveLength(0);
  });
});

describe("FR-15: suspended and deleted accounts can't sign in", () => {
  test("a suspended account gets no session", async () => {
    const h = await createHarness();
    const who = person("s@uni.example");
    expect((await signIn(h, who)).session).toBe(true); // control
    const [user] = await usersNamed(h, who.email!);
    await banUser(h, user!.id);
    const res = await signIn(h, who);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "AUTH_ACCOUNT_SUSPENDED" });
    expect(res.session).toBe(false);
  });

  test("a deleted account gets no session (and no new account)", async () => {
    const h = await createHarness();
    const who = person("d@uni.example");
    expect((await signIn(h, who)).session).toBe(true); // control
    const [user] = await usersNamed(h, who.email!);
    await deleteUser(h, user!.id);
    const res = await signIn(h, who);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "AUTH_ACCOUNT_UNAVAILABLE" });
    expect(res.session).toBe(false);
    expect(await usersNamed(h, who.email!)).toHaveLength(1);
  });
});
