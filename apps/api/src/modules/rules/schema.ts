import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createdAt, id, updatedAt } from "../../db/columns.ts";
import { users } from "../users/schema.ts";

export type RuleList = "whitelist" | "blacklist";
export type RuleType = "domain" | "regex";

/**
 * Domain rules for link destinations (FR-14). A destination host is allowed
 * when it matches at least one whitelist rule and no blacklist rule.
 *
 * - `domain`: a normalized hostname (`example.com`) or a leading wildcard
 *   (`*.example.com`, subdomains at any depth but not `example.com` itself).
 * - `regex`: an RE2 pattern matched against the whole hostname,
 *   case-insensitively.
 */
export const rules = sqliteTable(
  "rules",
  {
    id: id(),
    list: text("list").$type<RuleList>().notNull(),
    type: text("type").$type<RuleType>().notNull().default("domain"),
    pattern: text("pattern").notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // Leading `type` serves both lookups: `type = 'domain' AND pattern IN (…)`
  // and `type = 'regex'`.
  (table) => [
    uniqueIndex("rules_type_pattern_list_unique").on(
      table.type,
      table.pattern,
      table.list,
    ),
  ],
);

/**
 * One row (`id = 1`) whose `version` is bumped on every rule write, so each
 * isolate can keep its compiled regex rules until they change.
 */
export const rulesVersion = sqliteTable("rules_version", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull(),
});
