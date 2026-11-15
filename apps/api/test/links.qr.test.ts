import { describe, expect, test } from "bun:test";
import { linkApi } from "./api.ts";
import { createLink, useSuite } from "./fixtures.ts";

/**
 * FR-10: the owner gets and downloads a QR code image for their short link.
 * It encodes the short link, not the destination, so it keeps working after
 * an edit, and showing or downloading it isn't a visit.
 */
const t = useSuite();
const api = () => linkApi(t.h);

describe("FR-10: QR codes", () => {
  test.todo("the owner gets a downloadable image", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    const res = await api().qr(code, t.owner);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\/(png|svg\+xml)/);
    expect(res.headers.get("content-disposition") ?? "").toContain(code);
    expect(res.body.length).toBeGreaterThan(100);
  });

  test.todo(
    "is the same image after the destination changes (encodes the short link)",
    async () => {
      const { code } = await createLink(
        t.h,
        t.owner,
        "https://example.com/old",
      );
      const first = await api().qr(code, t.owner);
      expect(first.status).toBe(200); // control: a real image, not two equal 404s
      const before = first.body as Uint8Array;
      await api().update(code, t.owner, {
        url: "https://example.com/somewhere-else",
      });
      const after = (await api().qr(code, t.owner)).body as Uint8Array;
      expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true);
    },
  );

  test.todo("different links get different images", async () => {
    const a = await createLink(t.h, t.owner, "https://example.com");
    const b = await createLink(t.h, t.owner, "https://example.com");
    const qa = (await api().qr(a.code, t.owner)).body as Uint8Array;
    const qb = (await api().qr(b.code, t.owner)).body as Uint8Array;
    expect(Buffer.from(qa).equals(Buffer.from(qb))).toBe(false);
  });

  test.todo(
    "showing or downloading it isn't counted as a visit (FR-11)",
    async () => {
      const { code } = await createLink(t.h, t.owner, "https://example.com");
      for (let i = 0; i < 3; i++)
        expect((await api().qr(code, t.owner)).status).toBe(200); // control
      expect((await api().stats(code, t.owner)).body.total).toBe(0);
    },
  );

  test.todo("a deleted link has no QR code", async () => {
    const { code } = await createLink(t.h, t.owner, "https://example.com");
    expect((await api().qr(code, t.owner)).status).toBe(200); // control
    await t.h.request("DELETE", `/v1/links/${code}`, { as: t.owner });
    expect((await api().qr(code, t.owner)).status).toBe(404);
  });

  test.todo(
    "decodes to the short URL, {site}/{code} (needs a QR decoder in devDependencies)",
  );
});
