import { describe, expect, test } from "bun:test";
import {
  browserOf,
  deviceOf,
  dayEnd,
  dayStart,
  referrerHost,
  utcDay,
} from "../src/modules/stats/parse.ts";

const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  firefoxLinux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  lineAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 Line/14.16.0/IAB",
};

describe("browserOf / deviceOf", () => {
  test.each([
    [UA.chromeWindows, "Chrome", "desktop"],
    [UA.safariMac, "Safari", "desktop"],
    [UA.safariIphone, "Mobile Safari", "mobile"],
    [UA.ipad, "Mobile Safari", "tablet"],
    [UA.firefoxLinux, "Firefox", "desktop"],
    [UA.lineAndroid, "Line", "mobile"],
  ])("%s", (ua, browser, device) => {
    expect(browserOf(ua)).toBe(browser);
    expect(deviceOf(ua)).toBe(device);
  });

  test.each([undefined, null, "", "curl-ish/0.0", "curl/8.5.0"])(
    "unrecognized (%p) is null",
    (ua) => {
      expect(browserOf(ua)).toBeNull();
      expect(deviceOf(ua)).toBeNull();
    },
  );
});

describe("referrerHost", () => {
  test.each([
    ["https://www.google.com/search?q=secret", "www.google.com"],
    ["http://Example.COM./a#b", "example.com"],
    ["https://user:pw@site.test:8443/x", "site.test"],
  ])("%s → %s", (header, host) => expect(referrerHost(header)).toBe(host));

  test.each([
    undefined,
    null,
    "",
    "not a url",
    "android-app://com.google.android.gm/",
    "file:///etc/passwd",
  ])("%p → null", (header) => expect(referrerHost(header)).toBeNull());
});

describe("UTC days", () => {
  test("a day runs from 00:00 UTC to the next 00:00 UTC", () => {
    expect(dayStart("2026-11-15").toISOString()).toBe(
      "2026-11-15T00:00:00.000Z",
    );
    expect(dayEnd("2026-11-15").toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(dayEnd("2026-12-31").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("the day changes at midnight UTC, not local midnight", () => {
    expect(utcDay(new Date("2026-11-14T23:59:59Z"))).toBe("2026-11-14");
    expect(utcDay(new Date("2026-11-15T00:00:00Z"))).toBe("2026-11-15");
    expect(utcDay(new Date("2026-11-15T06:00:00+07:00"))).toBe("2026-11-14");
  });
});
