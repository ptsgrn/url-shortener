import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { links } from "../src/modules/links/schema.ts";
import { banLink, isRedirect, LinkErrors, linkApi, ok } from "./api.ts";
import { createLink, useSuite } from "./fixtures.ts";

/**
 * FR-08: the owner turns a link off (a temporary stop, reversible) or on,
 * and deletes it (permanent, the code stays reserved). Disabled or deleted
 * links don't redirect. The owner can't re-enable over an admin suspension.
 * (Delete itself is covered in links.crud.test.ts.)
 */
const t = useSuite();
const api = () => linkApi(t.h);

describe("FR-08: turning a link off and on", () => {
  test("off stops the redirect; on brings it back", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const off = await api().update(code, t.owner, { active: false });
    expect(off.status).toBe(200);
    expect(off.body.status).toBe("disabled");
    expect(isRedirect((await api().visit(code)).status)).toBe(false);

    const on = await api().update(code, t.owner, { active: true });
    expect(on.body.status).toBe("active");
    expect(isRedirect((await api().visit(code)).status)).toBe(true);
  });

  test("turning off keeps the destination and the code", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com/keep");
    await api().update(code, t.owner, { active: false });
    const { body } = await t.h.request("GET", `/v1/links/${code}`);
    expect(body.url).toBe("https://example.com/keep");
    expect(body.deactivatedAt).not.toBeNull();
  });

  test("is idempotent", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await api().update(code, t.owner, { active: false });
    const again = await api().update(code, t.owner, { active: false });
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("disabled");
  });

  test("the owner can't re-enable a link an admin suspended", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await banLink(t.h, code);
    const res = await api().update(code, t.owner, { active: true });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: LinkErrors.Banned });
    expect(isRedirect((await api().visit(code)).status)).toBe(false);
  });

  test.todo(
    "FR-13: lifting a suspension doesn't re-enable a link the owner turned off",
    async () => {
      const { code } = await createLink(t.h, t.owner, "https://example.com");
      await api().update(code, t.owner, { active: false });
      await banLink(t.h, code);
      // Admin lifts the suspension (FR-13), simulated directly.
      await t.h.db
        .update(links)
        .set({ bannedAt: null, bannedReason: null })
        .where(eq(links.code, code));
      expect((await api().details(code, t.owner)).body.status).toBe("disabled");
    },
  );

  test("a deleted link can't be turned back on", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await ok(api().update(code, t.owner, { active: false })); // control
    await t.h.request("DELETE", `/v1/links/${code}`, { as: t.owner });
    const res = await api().update(code, t.owner, { active: true });
    expect(res.status).toBe(404);
    expect(isRedirect((await api().visit(code)).status)).toBe(false);
  });

  test.todo("someone else can't turn it off", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    expect((await api().update(code, t.other, { active: false })).status).toBe(
      404,
    );
    expect((await api().details(code, t.owner)).body.status).toBe("active");
  });
});
