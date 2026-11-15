import { afterAll, beforeAll, beforeEach, expect } from "bun:test";
import { createHarness, type Harness, type TestUser } from "./harness.ts";

/** nanoid's URL-safe alphabet, 7 characters (see `links/random.ts`). */
export const CODE = /^[A-Za-z0-9_-]{7}$/;

export const addRule = async (
  h: Harness,
  admin: TestUser,
  list: "whitelist" | "blacklist",
  pattern: string,
  type: "domain" | "regex" = "domain",
): Promise<string> => {
  const res = await h.request("POST", "/v1/rules", {
    as: admin,
    body: { list, type, pattern },
  });
  expect(res.status).toBe(201);
  return res.body.id;
};

export const removeRule = async (h: Harness, admin: TestUser, id: string) => {
  const res = await h.request("DELETE", `/v1/rules/${id}`, { as: admin });
  expect(res.status).toBe(204);
};

/** Whitelists every host (regex `.*`), so tests not about rules can create links. */
export const allowAll = (h: Harness, admin: TestUser) =>
  addRule(h, admin, "whitelist", ".*", "regex");

export const createLink = async (h: Harness, as: TestUser, url: string) => {
  const res = await h.request("POST", "/v1/links", { as, body: { url } });
  expect(res.status).toBe(200);
  return res.body as { code: string; url: string; blocked: boolean };
};

export interface Suite {
  h: Harness;
  /** Signed-in user who owns the links under test. */
  owner: TestUser;
  /** Another signed-in user. */
  other: TestUser;
  admin: TestUser;
}

/**
 * Registers a fresh harness for the file, and a clean database with
 * `owner`, `other` and `admin` users before each test. With `allowAll`
 * (default) every host is whitelisted, so tests not about FR-04 can create
 * links.
 */
export const useSuite = ({ allowAll: allow = true } = {}): Suite => {
  const suite = {} as Suite;
  beforeAll(async () => {
    suite.h = await createHarness();
  });
  afterAll(() => suite.h.dispose());
  beforeEach(async () => {
    await suite.h.reset();
    suite.owner = await suite.h.signIn();
    suite.other = await suite.h.signIn();
    suite.admin = await suite.h.signIn({ role: "admin" });
    if (allow) await allowAll(suite.h, suite.admin);
  });
  return suite;
};
