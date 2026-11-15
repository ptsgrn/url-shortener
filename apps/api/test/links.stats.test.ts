import { describe, expect, test } from "bun:test";
import { banLink, findStored, linkApi, today, ok } from "./api.ts";
import { linkVisits } from "../src/modules/stats/schema.ts";
import { createLink, useSuite } from "./fixtures.ts";

/**
 * FR-11: count every request that passes FR-09 and is redirected, once each
 * (repeat visits count again; this isn't unique people). Show the total,
 * per day, and by device, browser and referrer domain, for a chosen date
 * range. Missing referrer / unrecognized device or browser go in an
 * "unknown" bucket (shown as "ไม่ทราบแหล่งที่มา" / "ไม่ทราบ" by the UI). Store
 * only what the stats need: no IPs or tracking ids.
 */
const t = useSuite();
const api = () => linkApi(t.h);

const CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("FR-11: visit stats", () => {
  test("counts every redirect, repeats included", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    for (let i = 0; i < 3; i++) await api().visit(code);
    const res = await api().stats(code, t.owner);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.daily).toEqual([{ date: today(), count: 3 }]);
  });

  test("doesn't count visits that weren't redirected (FR-09)", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await api().visit(code);
    await banLink(t.h, code);
    await api().visit(code);
    await api().visit(code);
    expect((await ok(api().stats(code, t.owner))).total).toBe(1);
  });

  test("doesn't count the owner's own lookups, details or list views", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await t.h.request("GET", `/v1/links/${code}`);
    await api().details(code, t.owner);
    await t.h.request("GET", "/v1/links", { as: t.owner });
    expect((await ok(api().stats(code, t.owner))).total).toBe(0);
  });

  test("breaks visits down by browser and device", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await api().visit(code, { "user-agent": CHROME_DESKTOP });
    await api().visit(code, { "user-agent": CHROME_DESKTOP });
    await api().visit(code, { "user-agent": SAFARI_IPHONE });
    const body = await ok(api().stats(code, t.owner));
    const counts = (o: Record<string, number>) => Object.values(o).sort();
    expect(counts(body.browsers)).toEqual([1, 2]);
    expect(counts(body.devices)).toEqual([1, 2]);
  });

  test("puts a missing or unrecognized user agent under unknown", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await api().visit(code);
    await api().visit(code, { "user-agent": "curl-ish/0.0" });
    const body = await ok(api().stats(code, t.owner));
    expect(body.browsers.unknown).toBe(2);
    expect(body.devices.unknown).toBe(2);
  });

  test("groups referrers by domain only; no referrer is unknown", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await api().visit(code, {
      referer: "https://www.google.com/search?q=private+query",
    });
    await api().visit(code, { referer: "https://www.google.com/other" });
    await api().visit(code);
    const body = await ok(api().stats(code, t.owner));
    expect(body.referrers).toEqual({ "www.google.com": 2, unknown: 1 });
  });

  test("stores no full referrer URL and no visitor IP", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await api().visit(code, {
      referer: "https://www.google.com/search?q=private+query",
      "cf-connecting-ip": "203.0.113.77",
      "x-forwarded-for": "203.0.113.77",
    });
    // Control: the visit was recorded, so there was something to leak.
    expect((await ok(api().stats(code, t.owner))).total).toBe(1);
    expect(await findStored(t.h, "private+query")).toEqual([]);
    expect(await findStored(t.h, "private query")).toEqual([]);
    expect(await findStored(t.h, "203.0.113.77")).toEqual([]);
  });

  test("filters by an inclusive date range", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    await api().visit(code);
    const inRange = await api().stats(code, t.owner, {
      from: today(),
      to: today(),
    });
    expect(inRange.body.total).toBe(1);
    const before = await api().stats(code, t.owner, {
      from: "2020-01-01",
      to: "2020-12-31",
    });
    expect(before.body.total).toBe(0);
    expect(before.body.daily).toEqual([]);
  });

  test("groups by UTC day and filters on UTC day boundaries", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const link = await t.h.db.query.links.findFirst({
      where: (l, { eq }) => eq(l.code, code),
    });
    await t.h.db.insert(linkVisits).values(
      [
        "2026-03-01T23:59:59Z", // last second of Mar 1 (UTC)
        "2026-03-02T00:00:00Z", // first second of Mar 2
        "2026-03-02T16:30:00Z", // still Mar 2 in UTC (Mar 3 in UTC+7)
      ].map((at) => ({ linkId: link!.id, visitedAt: new Date(at) })),
    );
    const all = await ok(api().stats(code, t.owner));
    expect(all.daily).toEqual([
      { date: "2026-03-01", count: 1 },
      { date: "2026-03-02", count: 2 },
    ]);
    const mar2 = await ok(
      api().stats(code, t.owner, { from: "2026-03-02", to: "2026-03-02" }),
    );
    expect(mar2.total).toBe(2);
    const mar1 = await ok(
      api().stats(code, t.owner, { from: "2026-03-01", to: "2026-03-01" }),
    );
    expect(mar1.total).toBe(1);
  });

  test("rejects a range that ends before it starts", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const res = await api().stats(code, t.owner, {
      from: "2026-02-01",
      to: "2026-01-01",
    });
    expect([400, 422]).toContain(res.status);
  });

  test("a new link starts with empty stats", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    expect(await ok(api().stats(code, t.owner))).toEqual({
      total: 0,
      daily: [],
      devices: {},
      browsers: {},
      referrers: {},
    });
  });

  test("only the owner sees them", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    expect((await api().stats(code, t.other)).status).toBe(404);
    expect((await api().stats(code)).status).toBe(401);
  });
});
