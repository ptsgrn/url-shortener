import { describe, expect, test } from "bun:test";
import {
  candidates,
  compileRegexes,
  hostOf,
  parseDomain,
  parseRegex,
  verdictFor,
} from "../src/modules/rules/matcher.ts";

describe("parseDomain (FR-14 rule format)", () => {
  test.each([
    ["example.com", "example.com"],
    ["  Example.COM.  ", "example.com"],
    ["*.Example.com", "*.example.com"],
    ["sub.example.co.th", "sub.example.co.th"],
    ["localhost", "localhost"],
    ["ตัวอย่าง.ไทย", "xn--72c1a1bt4awk9o.xn--o3cw4h"],
  ])("accepts %p as %p", (input, normalized) => {
    expect(parseDomain(input)).toBe(normalized);
  });

  test.each([
    ["a scheme", "https://example.com"],
    ["a path", "example.com/path"],
    ["a query", "example.com?q=1"],
    ["a fragment", "example.com#x"],
    ["a port", "example.com:8080"],
    ["userinfo", "user@example.com"],
    ["a bare *", "*"],
    ["an empty wildcard", "*."],
    ["a trailing wildcard", "example.*"],
    ["a wildcard mid-label", "ex*mple.com"],
    ["a partial-label wildcard", "a*.example.com"],
    ["two wildcards", "*.*.example.com"],
    ["an empty label", "example..com"],
    ["whitespace inside", "exa mple.com"],
    ["an empty string", ""],
  ])("rejects %s", (_, input) => {
    expect(parseDomain(input)).toBeUndefined();
  });
});

describe("parseRegex", () => {
  test.each([
    "(www|m)\\.example\\.com",
    ".*",
    "(?i)FOO",
    "\\Qa.b\\E",
    "(a+)+b",
  ])("accepts %p", (p) => expect(parseRegex(p)).toBe(p));

  test.each([
    ["a backreference", "(a)\\1"],
    ["a lookahead", "(?=a)b"],
    ["a lookbehind", "(?<=a)b"],
    ["unbalanced parens", "(abc"],
    ["an anchor escape", "a)|.*|(b"],
    ["an unterminated \\Q", "\\Qabc"],
    ["an empty pattern", "   "],
    ["over 256 chars", "a".repeat(257)],
  ])("rejects %s", (_, p) => expect(parseRegex(p)).toBeUndefined());
});

describe("hostOf", () => {
  test.each([
    ["https://Example.COM./a?b#c", "example.com"],
    ["https://127.0.0.1:8080/", "127.0.0.1"],
  ])("%p → %p", (url, host) => expect(hostOf(url)).toBe(host));

  test.each([
    "not a url",
    "http://example.com",
    "javascript:alert(1)",
    "mailto:a@b.c",
  ])("has no host for %p", (url) => expect(hostOf(url)).toBeUndefined());
});

test("candidates: the host plus every parent wildcard", () => {
  expect(candidates("a.b.example.com")).toEqual([
    "a.b.example.com",
    "*.b.example.com",
    "*.example.com",
    "*.com",
  ]);
});

describe("verdictFor", () => {
  const none = compileRegexes([]);
  const lists = (...l: ("whitelist" | "blacklist")[]) => new Set(l);

  test("needs a whitelist match", () => {
    expect(verdictFor("a.com", lists(), none)).toBe("not_whitelisted");
    expect(verdictFor("a.com", lists("whitelist"), none)).toBe("allowed");
  });

  test("blacklist wins over whitelist", () => {
    expect(verdictFor("a.com", lists("whitelist", "blacklist"), none)).toBe(
      "blacklisted",
    );
    const regex = compileRegexes([
      { list: "whitelist", pattern: ".*" },
      { list: "blacklist", pattern: "bad\\..*" },
    ]);
    expect(verdictFor("bad.com", lists(), regex)).toBe("blacklisted");
    expect(verdictFor("good.com", lists(), regex)).toBe("allowed");
  });

  test("a pathological regex stays fast on a max-length host", () => {
    const regex = compileRegexes([{ list: "blacklist", pattern: "(a+)+b" }]);
    const host = Array(4).fill("a".repeat(62)).join(".");
    const start = performance.now();
    verdictFor(host, lists("whitelist"), regex);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
