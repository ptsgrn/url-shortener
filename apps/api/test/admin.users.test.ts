import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { users } from "../src/modules/users/schema.ts";
import {
  deleteUser,
  isRedirect,
  linkApi,
  ok,
  refresh,
  refreshCookie,
} from "./api.ts";
import { createLink, useSuite } from "./fixtures.ts";

/**
 * FR-15 and FR-03: admins list accounts, and suspend or restore them. A
 * suspension ends the user's sessions, refuses the management API, and
 * stops their links redirecting, and is recorded with who, when and why.
 */
const t = useSuite();
const api = () => linkApi(t.h);
const as = (
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  who = t.admin,
) => t.h.request(method, `/v1/admin${path}`, { as: who, body });
const suspend = (id: string, reason = "spam", who = t.admin) =>
  as("POST", `/users/${id}/suspension`, { reason }, who);
const restore = (id: string, reason?: string, who = t.admin) =>
  as("DELETE", `/users/${id}/suspension`, reason ? { reason } : undefined, who);
/** Account entries in the audit log (the suite's setup also adds a rule). */
const auditRows = () =>
  t.h.db.query.adminActions.findMany({
    where: (a, { eq }) => eq(a.targetType, "user"),
  });

const named = (name: string, email: string) =>
  t.h.db.update(users).set({ name, email });

describe("GET /v1/admin/users", () => {
  test("lists accounts, newest first, with their role, status and link count", async () => {
    await createLink(t.h, t.owner, "https://example.com/1");
    await createLink(t.h, t.owner, "https://example.com/2");
    const list = await ok(as("GET", "/users"));
    expect(list.map((u: { id: string }) => u.id)).toEqual([
      t.admin.id,
      t.other.id,
      t.owner.id,
    ]);
    const owner = list.find((u: { id: string }) => u.id === t.owner.id);
    expect(owner).toMatchObject({
      role: "user",
      status: "active",
      suspendedAt: null,
      linkCount: 2,
    });
    expect(list[0].role).toBe("admin");
  });

  test("filters by q (email or name), role and status", async () => {
    await named("Alice Smith", "alice@uni.example").where(
      eq(users.id, t.owner.id),
    );
    await named("Bob", "bob_100%@uni.example").where(eq(users.id, t.other.id));
    const ids = async (query: Record<string, string>) =>
      (
        await ok(t.h.request("GET", "/v1/admin/users", { as: t.admin, query }))
      ).map((u: { id: string }) => u.id);
    expect(await ids({ q: "alice" })).toEqual([t.owner.id]);
    expect(await ids({ q: "Smith" })).toEqual([t.owner.id]);
    // `%` and `_` match literally, not as wildcards.
    expect(await ids({ q: "_100%" })).toEqual([t.other.id]);
    expect(await ids({ q: "b%b" })).toEqual([]);
    expect(await ids({ role: "admin" })).toEqual([t.admin.id]);
    await suspend(t.owner.id);
    expect(await ids({ status: "suspended" })).toEqual([t.owner.id]);
    expect(await ids({ status: "active" })).not.toContain(t.owner.id);
  });

  test("pages with offset and limit; deleted accounts are left out", async () => {
    await deleteUser(t.h, t.other.id);
    const query = (offset: number) => ({ offset: String(offset), limit: "1" });
    const page = async (offset: number) =>
      (
        await ok(
          t.h.request("GET", "/v1/admin/users", {
            as: t.admin,
            query: query(offset),
          }),
        )
      ).map((u: { id: string }) => u.id);
    expect([
      ...(await page(0)),
      ...(await page(1)),
      ...(await page(2)),
    ]).toEqual([t.admin.id, t.owner.id]);
  });

  test("one account, with link counts by state", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/a");
    const b = await createLink(t.h, t.owner, "https://example.com/b");
    await createLink(t.h, t.owner, "https://example.com/c");
    await api().update(code, t.owner, { active: false });
    await t.h.request("DELETE", `/v1/links/${b.code}`, { as: t.owner });
    const user = await ok(as("GET", `/users/${t.owner.id}`));
    expect(user.links).toEqual({
      total: 2,
      disabled: 1,
      banned: 0,
      deleted: 1,
    });
    expect((await as("GET", "/users/nobody")).status).toBe(404);
  });

  test("admins only", async () => {
    expect((await as("GET", "/users", undefined, t.owner)).status).toBe(403);
    expect((await t.h.request("GET", "/v1/admin/users")).status).toBe(401);
  });
});

describe("FR-15: suspending an account", () => {
  test("ends its sessions, refuses the API, stops its links, keeps them", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const session = await refreshCookie(t.h, t.owner.id);
    expect(isRedirect((await api().visit(code)).status)).toBe(true); // control

    const res = await suspend(t.owner.id, "phishing links");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "suspended",
      suspendedReason: "phishing links",
    });
    expect(Date.parse(res.body.suspendedAt)).not.toBeNaN();

    // Every session ends: the refresh token no longer works.
    expect((await refresh(t.h, session.cookie)).status).toBe(401);
    // Management API refused, links don't redirect, but they still exist.
    expect(
      (await api().create(t.owner, { url: "https://example.com" })).status,
    ).toBe(403);
    expect(isRedirect((await api().visit(code)).status)).toBe(false);
    expect((await t.h.request("GET", `/v1/links/${code}`)).status).toBe(200);
    // `/me` tells the UI why.
    const me = await t.h.request("GET", "/v1/auth/me", { as: t.owner });
    expect(me.body).toMatchObject({ suspended: true, role: "user" });
  });

  test("is recorded with the admin, the reason and the time", async () => {
    await suspend(t.owner.id, "phishing links");
    const [entry] = await auditRows();
    expect(entry).toMatchObject({
      actorId: t.admin.id,
      action: "user.suspend",
      targetType: "user",
      targetId: t.owner.id,
      reason: "phishing links",
    });
    expect(Date.now() - entry!.createdAt.getTime()).toBeLessThan(60_000);
  });

  test("twice changes and records nothing more", async () => {
    await ok(suspend(t.owner.id, "first"));
    const again = await ok(suspend(t.owner.id, "second"));
    expect(again.suspendedReason).toBe("first");
    expect(await auditRows()).toHaveLength(1);
  });

  test("needs a reason", async () => {
    const res = await as("POST", `/users/${t.owner.id}/suspension`, {});
    expect(res.status).toBe(422);
    expect(
      (await as("POST", `/users/${t.owner.id}/suspension`, { reason: "" }))
        .status,
    ).toBe(422);
  });

  test("an admin can't suspend themselves or another admin", async () => {
    const self = await suspend(t.admin.id);
    expect(self.status).toBe(403);
    expect(self.body).toEqual({ error: "ADMIN_CANNOT_SUSPEND_SELF" });
    const second = await t.h.signIn({ role: "admin" });
    const other = await suspend(second.id);
    expect(other.status).toBe(403);
    expect(other.body).toEqual({ error: "ADMIN_CANNOT_SUSPEND_ADMIN" });
    expect(await auditRows()).toHaveLength(0);
  });

  test("an unknown or deleted account is 404", async () => {
    expect((await suspend("nobody")).status).toBe(404);
    await deleteUser(t.h, t.other.id);
    expect((await suspend(t.other.id)).status).toBe(404);
  });

  test("admins only", async () => {
    expect((await suspend(t.other.id, "x", t.owner)).status).toBe(403);
    expect(
      (
        await t.h.request("POST", `/v1/admin/users/${t.other.id}/suspension`, {
          body: { reason: "x" },
        })
      ).status,
    ).toBe(401);
    expect((await ok(as("GET", `/users/${t.other.id}`))).status).toBe("active");
  });
});

describe("FR-15: restoring an account", () => {
  test("lifts the suspension; old sessions stay ended; links redirect again", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const session = await refreshCookie(t.h, t.owner.id);
    await suspend(t.owner.id);
    const res = await restore(t.owner.id, "appeal accepted");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "active",
      suspendedAt: null,
      suspendedReason: null,
    });
    // Must sign in again (FR-15).
    expect((await refresh(t.h, session.cookie)).status).toBe(401);
    expect(isRedirect((await api().visit(code)).status)).toBe(true);
    await ok(api().update(code, t.owner, { active: false }));
  });

  test("is recorded; restoring an active account records nothing", async () => {
    await ok(restore(t.owner.id));
    expect(await auditRows()).toHaveLength(0);
    await suspend(t.owner.id);
    await ok(restore(t.owner.id, "appeal accepted"));
    const entries = await auditRows();
    expect(entries.map((e) => e.action).sort()).toEqual([
      "user.restore",
      "user.suspend",
    ]);
    expect(entries.find((e) => e.action === "user.restore")?.reason).toBe(
      "appeal accepted",
    );
  });

  test("the reason is optional", async () => {
    await suspend(t.owner.id);
    expect((await restore(t.owner.id)).status).toBe(200);
  });
});
