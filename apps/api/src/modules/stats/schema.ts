import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { id } from "../../db/columns.ts";
import { links } from "../links/schema.ts";

/**
 * One row per redirect (FR-11). Only what the stats need: no IP, user agent,
 * full referrer or visitor id. `null` device / browser / referrer = unknown.
 */
export const linkVisits = sqliteTable(
  "link_visits",
  {
    id: id(),
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    visitedAt: integer("visited_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    device: text("device"),
    browser: text("browser"),
    referrerHost: text("referrer_host"),
  },
  (table) => [
    index("link_visits_link_time_idx").on(table.linkId, table.visitedAt),
  ],
);
