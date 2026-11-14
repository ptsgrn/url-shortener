import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { err, ok, okAsync, type Result, type ResultAsync } from "neverthrow";
import type { DB } from "../../db/index.ts";
import { dbQuery, InternalError } from "../../utils/error.ts";
import {
  candidates,
  compileRegexes,
  hostOf,
  parseDomain,
  parseRegex,
  verdictFor,
  type RegexMatcher,
  type Verdict,
} from "./matcher.ts";
import { RuleError, type RuleModel } from "./model.ts";
import { rules, rulesVersion, type RuleList, type RuleType } from "./schema.ts";

export type { Verdict } from "./matcher.ts";

/** D1 allows at most 100 bound parameters per query (one is `type`). */
const CHUNK = 90;

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/**
 * Compiled regex rules per database, tagged with the `rules_version` they
 * were built from. Lives for the isolate's lifetime; every check re-reads
 * the version (in the same round trip as the domain lookup), so a rule
 * change takes effect on the very next check.
 */
const regexCache = new WeakMap<
  DB,
  { version: number; matcher: RegexMatcher }
>();

const bumpVersion = (db: DB) =>
  db
    .insert(rulesVersion)
    .values({ id: 1, version: 1 })
    .onConflictDoUpdate({
      target: rulesVersion.id,
      set: { version: sql`${rulesVersion.version} + 1` },
    });

const regexMatcher = (
  db: DB,
  version: number,
): ResultAsync<RegexMatcher, InternalError.Database> => {
  const hit = regexCache.get(db);
  if (hit?.version === version) return okAsync(hit.matcher);
  return dbQuery(() =>
    db
      .select({ list: rules.list, pattern: rules.pattern })
      .from(rules)
      .where(eq(rules.type, "regex")),
  ).andThen((rows) => {
    try {
      const matcher = compileRegexes(rows);
      regexCache.set(db, { version, matcher });
      return ok(matcher);
    } catch (cause) {
      // Fail closed: links are not checked against a partial rule set.
      console.error(`[${InternalError.Database}] regex rules`, cause);
      return err(InternalError.Database as const);
    }
  });
};

const parsePattern = (
  type: RuleType,
  input: string,
): Result<string, RuleError.InvalidPattern> => {
  const pattern = type === "regex" ? parseRegex(input) : parseDomain(input);
  return pattern ? ok(pattern) : err(RuleError.InvalidPattern);
};

export abstract class Rule {
  static hostOf = hostOf;

  /**
   * Verdicts for many hosts against the current rules, in one D1 round trip
   * (plus one more when the regex rules changed since this isolate last
   * compiled them).
   */
  static verdicts(
    db: DB,
    hosts: string[],
  ): ResultAsync<Map<string, Verdict>, InternalError.Database> {
    const unique = [...new Set(hosts)];
    if (unique.length === 0) return okAsync(new Map());
    const patterns = [...new Set(unique.flatMap(candidates))];

    const version = db
      .select({ version: rulesVersion.version })
      .from(rulesVersion)
      .where(eq(rulesVersion.id, 1));
    const domainQueries = chunks(patterns, CHUNK).map((part) =>
      db
        .select({ list: rules.list, pattern: rules.pattern })
        .from(rules)
        .where(and(eq(rules.type, "domain"), inArray(rules.pattern, part))),
    );

    return dbQuery(() => db.batch([version, ...domainQueries]))
      .andThen(([versionRows, ...domainRows]) =>
        regexMatcher(db, versionRows[0]?.version ?? 0).map((regex) => ({
          regex,
          domainRows: domainRows.flat(),
        })),
      )
      .map(({ regex, domainRows }) => {
        const lists = new Map<string, Set<RuleList>>();
        for (const { list, pattern } of domainRows) {
          if (!lists.has(pattern)) lists.set(pattern, new Set());
          lists.get(pattern)!.add(list);
        }
        return new Map(
          unique.map((host) => {
            const matched = new Set(
              candidates(host).flatMap((c) => [...(lists.get(c) ?? [])]),
            );
            return [host, verdictFor(host, matched, regex)];
          }),
        );
      });
  }

  /** Verdict for one destination URL; an unparseable URL is `not_whitelisted`. */
  static check(
    db: DB,
    url: string,
  ): ResultAsync<Verdict, InternalError.Database> {
    const host = hostOf(url);
    if (!host) return okAsync("not_whitelisted");
    return Rule.verdicts(db, [host]).map(
      (v) => v.get(host) ?? "not_whitelisted",
    );
  }

  static list(
    db: DB,
    { list, type, offset = 0, limit = 50 }: RuleModel["listQuery"],
  ): ResultAsync<RuleModel["rule"][], InternalError.Database> {
    return dbQuery(() =>
      db.query.rules.findMany({
        where: and(
          list ? eq(rules.list, list) : undefined,
          type ? eq(rules.type, type) : undefined,
        ),
        orderBy: [asc(rules.list), asc(rules.type), asc(rules.pattern)],
        offset,
        limit,
      }),
    );
  }

  static create(
    db: DB,
    { list, type = "domain", pattern }: RuleModel["createBody"],
    userId: string,
  ): ResultAsync<
    RuleModel["rule"],
    RuleError.InvalidPattern | RuleError.Duplicate | InternalError.Database
  > {
    return parsePattern(type, pattern)
      .asyncAndThen((pattern) =>
        dbQuery(() =>
          db.batch([
            db
              .insert(rules)
              .values({ list, type, pattern, createdBy: userId })
              .onConflictDoNothing()
              .returning(),
            bumpVersion(db),
          ]),
        ),
      )
      .andThen(([[rule]]) => (rule ? ok(rule) : err(RuleError.Duplicate)));
  }

  /** Changes a rule's list, type or pattern; the pattern is re-validated for the resulting type. */
  static update(
    db: DB,
    id: string,
    body: RuleModel["updateBody"],
  ): ResultAsync<
    RuleModel["rule"],
    | RuleError.NotFound
    | RuleError.InvalidPattern
    | RuleError.Duplicate
    | InternalError.Database
  > {
    return dbQuery(() => db.query.rules.findFirst({ where: eq(rules.id, id) }))
      .andThen((rule) => (rule ? ok(rule) : err(RuleError.NotFound)))
      .andThen((rule) => {
        const type = body.type ?? rule.type;
        return parsePattern(type, body.pattern ?? rule.pattern).map(
          (pattern) => ({ list: body.list ?? rule.list, type, pattern }),
        );
      })
      .andThen((next) =>
        dbQuery(() =>
          db.query.rules.findFirst({
            where: and(
              eq(rules.list, next.list),
              eq(rules.type, next.type),
              eq(rules.pattern, next.pattern),
              ne(rules.id, id),
            ),
            columns: { id: true },
          }),
        ).andThen((clash) => (clash ? err(RuleError.Duplicate) : ok(next))),
      )
      .andThen((next) =>
        dbQuery(() =>
          db.batch([
            db
              .update(rules)
              .set({ ...next, updatedAt: new Date() })
              .where(eq(rules.id, id))
              .returning(),
            bumpVersion(db),
          ]),
        ),
      )
      .andThen(([[updated]]) =>
        updated ? ok(updated) : err(RuleError.NotFound),
      );
  }

  static delete(
    db: DB,
    id: string,
  ): ResultAsync<void, RuleError.NotFound | InternalError.Database> {
    return dbQuery(() =>
      db.batch([
        db.delete(rules).where(eq(rules.id, id)).returning({ id: rules.id }),
        bumpVersion(db),
      ]),
    ).andThen(([deleted]) =>
      deleted.length > 0 ? ok(undefined) : err(RuleError.NotFound),
    );
  }
}
