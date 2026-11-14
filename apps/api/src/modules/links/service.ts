import { eq } from "drizzle-orm";
import { err, ok, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, type InternalError } from "../../utils/error.ts";
import { LinkError, type LinkModel } from "./model.ts";
import { links } from "./schema.ts";

export abstract class Link {
  static create(
    db: DB,
    { url }: LinkModel["createBody"],
    userId: string,
  ): ResultAsync<LinkModel["link"], InternalError.Database> {
    // TODO: handle the (unlikely) code collision
    const code = Math.random().toString(36).slice(2, 8);
    return dbQuery(() =>
      db
        .insert(links)
        .values({ code, url, userId })
        .returning({ code: links.code, url: links.url })
        .get(),
    ).map((link) => link!);
  }

  static find(
    db: DB,
    code: string,
  ): ResultAsync<
    LinkModel["link"],
    LinkError.NotFound | InternalError.Database
  > {
    return dbQuery(() =>
      db.query.links.findFirst({
        where: eq(links.code, code),
        columns: { code: true, url: true },
      }),
    ).andThen((link) => (link ? ok(link) : err(LinkError.NotFound)));
  }
}
