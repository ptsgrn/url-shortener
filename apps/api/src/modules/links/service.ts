import { eq } from "drizzle-orm";
import { status } from "elysia";
import type { DB } from "../../db/index.ts";
import type { LinkModel } from "./model.ts";
import { links } from "./schema.ts";

export abstract class Link {
  static async create(
    db: DB,
    { url }: LinkModel["createBody"],
    userId: string,
  ): Promise<LinkModel["link"]> {
    // TODO: handle the (unlikely) code collision
    const code = Math.random().toString(36).slice(2, 8);
    const [link] = await db
      .insert(links)
      .values({ code, url, userId })
      .returning({ code: links.code, url: links.url });
    return link!;
  }

  static async find(db: DB, code: string): Promise<LinkModel["link"]> {
    const link = await db.query.links.findFirst({
      where: eq(links.code, code),
      columns: { code: true, url: true },
    });
    if (!link)
      throw status(404, {
        message: "Link not found",
      } satisfies LinkModel["notFound"]);
    return link;
  }
}
