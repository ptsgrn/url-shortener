import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { getDb } from "../db/index.ts";
import { links } from "../db/schema.ts";

/** Version 1 of the public API, mounted at `/api/v1` by `app.ts`. */
export const v1 = new Elysia({ aot: false })
  .post(
    "/links",
    async ({ body }) => {
      // TODO: handle the (unlikely) code collision
      const code = Math.random().toString(36).slice(2, 8);
      const [link] = await getDb()
        .insert(links)
        .values({ code, url: body.url })
        .returning({ code: links.code, url: links.url });
      return link!;
    },
    {
      body: t.Object({
        url: t.String({ format: "uri" }),
      }),
    },
  )
  .get("/links/:code", async ({ params, status }) => {
    const link = await getDb().query.links.findFirst({
      where: eq(links.code, params.code),
      columns: { code: true, url: true },
    });
    return link ?? status(404, { message: "Link not found" });
  });
