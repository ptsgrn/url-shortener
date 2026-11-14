import { RE2JS } from "re2js";
import type { RuleList } from "./schema.ts";

/**
 * Pure rule matching (no DB). Regexes run on RE2JS, not V8's `RegExp`: RE2
 * matches in time linear in the input, so an admin-supplied pattern like
 * `(a+)+b` can't hang every link check (catastrophic backtracking). RE2 has
 * no backreferences or lookarounds; those patterns are rejected on save.
 */

export const MAX_REGEX_LENGTH = 256;

const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
/** Anything that makes the input more than a hostname: scheme, path, query, fragment, userinfo, port, whitespace. */
const NOT_A_HOST = /[\s/?#@:\\]/;

/** Lowercase, punycode, no trailing dot; `undefined` if not a valid hostname. */
const normalizeHost = (input: string): string | undefined => {
  let host: string;
  try {
    host = new URL(`http://${input}`).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/\.$/, "");
  return HOSTNAME.test(host) ? host : undefined;
};

/**
 * A domain rule, normalized: a bare hostname (`Example.COM` → `example.com`)
 * or `*.` + hostname. `undefined` for schemes, paths, queries, ports, IPv6
 * literals and `*` anywhere but a leading `*.`.
 */
export const parseDomain = (input: string): string | undefined => {
  const raw = input.trim().toLowerCase();
  if (NOT_A_HOST.test(raw)) return undefined;
  const wildcard = raw.startsWith("*.");
  const rest = wildcard ? raw.slice(2) : raw;
  if (rest.includes("*")) return undefined;
  const host = normalizeHost(rest);
  return host && (wildcard ? `*.${host}` : host);
};

/** Each pattern must match the whole hostname, and stays self-contained when joined with others. */
const anchored = (sources: string[]) =>
  `^(?:${sources.map((s) => `(?:${s})`).join("|")})$`;

const compile = (sources: string[]) =>
  RE2JS.compile(anchored(sources), RE2JS.CASE_INSENSITIVE);

/**
 * A regex rule, trimmed; `undefined` if empty, too long, or not valid RE2
 * both on its own and anchored. Requiring both rejects patterns that only
 * balance once wrapped and would escape the anchors, like `a)|.*|(b`, and an
 * unterminated `\Q` that would swallow the closing `)`.
 */
export const parseRegex = (input: string): string | undefined => {
  const source = input.trim();
  if (!source || source.length > MAX_REGEX_LENGTH) return undefined;
  try {
    RE2JS.compile(source);
    compile([source]);
    return source;
  } catch {
    return undefined;
  }
};

/** The host of a destination URL, normalized like domain rules. */
export const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return undefined;
  }
};

/**
 * Domain patterns a host matches: `a.b.example.com` → `a.b.example.com`,
 * `*.b.example.com`, `*.example.com`, `*.com`.
 */
export const candidates = (host: string): string[] => {
  const labels = host.split(".");
  return [
    host,
    ...labels.slice(1).map((_, i) => `*.${labels.slice(i + 1).join(".")}`),
  ];
};

/** All regex rules of each list compiled into one alternation (one pass per host, not one per rule). */
export interface RegexMatcher {
  whitelist: RE2JS | null;
  blacklist: RE2JS | null;
}

/** Throws if RE2 can't compile the union (e.g. it exceeds RE2's program size). */
export const compileRegexes = (
  rows: { list: RuleList; pattern: string }[],
): RegexMatcher => {
  const of = (list: RuleList) => {
    const sources = rows.filter((r) => r.list === list).map((r) => r.pattern);
    return sources.length ? compile(sources) : null;
  };
  return { whitelist: of("whitelist"), blacklist: of("blacklist") };
};

/**
 * Why a host is or isn't allowed. A host must match at least one whitelist
 * rule and no blacklist rule; a blacklist match wins over a whitelist one.
 */
export type Verdict = "allowed" | "blacklisted" | "not_whitelisted";

export const verdictFor = (
  host: string,
  domainLists: Set<RuleList>,
  regex: RegexMatcher,
): Verdict => {
  if (domainLists.has("blacklist") || regex.blacklist?.matches(host))
    return "blacklisted";
  if (domainLists.has("whitelist") || regex.whitelist?.matches(host))
    return "allowed";
  return "not_whitelisted";
};
