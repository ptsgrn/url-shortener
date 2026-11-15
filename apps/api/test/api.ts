import { eq, sql } from "drizzle-orm";
import { links } from "../src/modules/links/schema.ts";
import { utcDay } from "../src/modules/stats/parse.ts";
import { users } from "../src/modules/users/schema.ts";
import { expect } from "bun:test";
import type { Harness, TestResponse, TestUser } from "./harness.ts";

/**
 * The API contract the spec tests (FR-04 … FR-11) are written against.
 *
 * Routes, status codes and error names for features that don't exist yet
 * are proposals: they live only here, so changing a decision is a one-line
 * edit. Tests for unbuilt features are `test.todo` (run them with
 * `bun test --todo`; Bun flags a todo that starts passing).
 */
/** The site's origin in tests (the app isn't tied to any one domain). */
export const SHORT_ORIGIN = "https://short.example";

/** Path segments the web app serves; a custom code must never take one (FR-05). */
export const SYSTEM_PATHS = ["api", "login", "_app", "API", "Login"];

export const LinkErrors = {
  NotFound: "LINK_NOT_FOUND",
  /** Destination fails FR-04. Proposed: also carries `reason`. */
  Blocked: "LINK_BLOCKED",
  /** FR-05: custom code already used (active, disabled, banned or deleted) or reserved. */
  CodeTaken: "LINK_CODE_TAKEN",
  /** FR-07/08: suspended by an admin, so the owner can't edit or re-enable it. */
  Banned: "LINK_BANNED",
  /** Only admins can change a link's owner. */
  OwnerChangeForbidden: "LINK_OWNER_CHANGE_FORBIDDEN",
  /** `userId` names no existing user. */
  OwnerNotFound: "LINK_OWNER_NOT_FOUND",
} as const;

/** Proposed `status` on the owner's views (FR-06, FR-08). */
export type LinkStatus = "active" | "disabled" | "banned" | "blocked";

export const linkApi = (h: Harness) => ({
  /** FR-05 */
  create: (as: TestUser, body: { url: string; code?: string }) =>
    h.request("POST", "/v1/links", { as, body }),
  /** FR-06: owner-only details. */
  details: (code: string, as?: TestUser) =>
    h.request("GET", `/v1/links/${code}/details`, { as }),
  /** FR-07 (`url`), FR-08 (`active`); admins also `userId`. */
  update: (
    code: string,
    as: TestUser | undefined,
    body: { url?: string; active?: boolean; userId?: string; code?: string },
  ) => h.request("PATCH", `/v1/links/${code}`, { as, body }),
  /** FR-10 */
  qr: (code: string, as?: TestUser) =>
    h.request("GET", `/v1/links/${code}/qr`, { as }),
  /** FR-11. `from` / `to` are `YYYY-MM-DD`, inclusive. */
  stats: (
    code: string,
    as?: TestUser,
    range: { from?: string; to?: string } = {},
  ) =>
    h.request("GET", `/v1/stats/${code}`, {
      as,
      query: Object.fromEntries(
        Object.entries(range).filter(([, v]) => v !== undefined),
      ) as Record<string, string>,
    }),
  /**
   * FR-09: what `{site}/{code}` does. The web app's root route is
   * expected to forward to this, so the API owns the decision.
   */
  visit: (code: string, headers: Record<string, string> = {}) =>
    h.request("GET", `/v1/r/${code}`, { headers }),
});

/**
 * Asserts a 200 and returns the body. Negative tests call this on a control
 * request first, so they can't pass just because a route doesn't exist yet.
 */
export const ok = async (pending: Promise<TestResponse>) => {
  const res = await pending;
  expect(res.status).toBe(200);
  return res.body;
};

/** A redirect the visitor's browser would follow (FR-09). */
export const isRedirect = (status: number) =>
  status === 301 || status === 302 || status === 307 || status === 308;

/** Simulates FR-13: an admin suspends a link. */
export const banLink = (h: Harness, code: string, reason = "reported") =>
  h.db
    .update(links)
    .set({ bannedAt: new Date(), bannedReason: reason })
    .where(eq(links.code, code));

/** Simulates FR-15: an admin suspends an account. */
export const banUser = (h: Harness, id: string) =>
  h.db
    .update(users)
    .set({ bannedAt: new Date().toISOString() })
    .where(eq(users.id, id));

/** Soft-deletes an account (sets `deletedAt`); its access token stays valid. */
export const deleteUser = (h: Harness, id: string) =>
  h.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));

/**
 * Every value stored anywhere in the database that contains `needle`, as
 * `table.column`. Used to prove something is *not* stored (FR-11: no IPs,
 * no full referrer URLs), whatever table a feature ends up using.
 */
export const findStored = async (
  h: Harness,
  needle: string,
): Promise<string[]> => {
  const tables = await h.db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'`,
  );
  const hits: string[] = [];
  for (const { name } of tables) {
    const rows = await h.db.all<Record<string, unknown>>(
      sql.raw(`SELECT * FROM "${name}"`),
    );
    for (const row of rows)
      for (const [column, value] of Object.entries(row))
        if (String(value).includes(needle)) hits.push(`${name}.${column}`);
  }
  return hits;
};

/** Today in UTC (stats days), `YYYY-MM-DD`. */
export const today = () => utcDay(new Date());
