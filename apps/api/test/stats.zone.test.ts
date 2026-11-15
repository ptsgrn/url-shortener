import { describe, expect, test } from "bun:test";
import {
  BUCKET_SECONDS,
  localDay,
  localDayStart,
  nextDay,
  parseTimeZone,
} from "../src/modules/stats/zone.ts";

/** Zones covering the awkward cases. */
const ZONES = [
  "UTC",
  "Asia/Bangkok", // +07:00, no DST
  "America/New_York", // DST at 02:00
  "Europe/London", // DST at 01:00 UTC
  "Asia/Kolkata", // +05:30
  "Asia/Kathmandu", // +05:45
  "Pacific/Chatham", // +12:45 / +13:45
  "Australia/Lord_Howe", // DST shifts by 30 minutes
  "America/Santiago", // clocks change at midnight
  "America/Havana", // clocks change at midnight
];

const daysOf2026 = Array.from({ length: 365 }, (_, i) =>
  new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
);

describe("parseTimeZone", () => {
  test.each([
    ["Asia/Bangkok", "Asia/Bangkok"],
    ["asia/bangkok", "Asia/Bangkok"],
    ["UTC", "UTC"],
    ["utc", "UTC"],
    ["America/New_York", "America/New_York"],
  ])("%p → %p", (input, zone) => expect(parseTimeZone(input)).toBe(zone));

  test.each(["", "Mars/Base", "ICT", "+07:00", "-05:00", " +07:00", "Asia/"])(
    "refuses %p",
    (input) => expect(parseTimeZone(input)).toBeUndefined(),
  );
});

describe("nextDay", () => {
  test.each([
    ["2026-03-01", "2026-03-02"],
    ["2026-12-31", "2027-01-01"],
    ["2028-02-28", "2028-02-29"],
    ["2026-02-28", "2026-03-01"],
  ])("%s → %s", (day, next) => expect(nextDay(day)).toBe(next));
});

describe("localDay", () => {
  test("Bangkok's day starts at 17:00 UTC the day before", () => {
    const at = Date.parse("2026-03-01T17:00:00Z");
    expect(localDay("Asia/Bangkok", at - 1)).toBe("2026-03-01");
    expect(localDay("Asia/Bangkok", at)).toBe("2026-03-02");
    expect(localDay("UTC", at)).toBe("2026-03-01");
  });
});

describe("localDayStart: the first instant of each local day", () => {
  test.each(ZONES)("%s, every day of 2026", (zone) => {
    for (const day of daysOf2026) {
      const start = localDayStart(zone, day);
      expect(localDay(zone, start)).toBe(day);
      // One millisecond earlier is still the day before.
      expect(nextDay(localDay(zone, start - 1))).toBe(day);
    }
  });

  test("New York's spring-forward day is 23 hours, fall-back day 25", () => {
    const hours = (day: string) =>
      (localDayStart("America/New_York", nextDay(day)) -
        localDayStart("America/New_York", day)) /
      3_600_000;
    expect(hours("2026-03-08")).toBe(23);
    expect(hours("2026-11-01")).toBe(25);
    expect(hours("2026-06-15")).toBe(24);
  });
});

describe("15-minute buckets never span two local days", () => {
  test.each(ZONES)("%s, every bucket edge of 2026", (zone) => {
    // Every local day starts exactly on a bucket boundary, so no bucket
    // can straddle midnight.
    for (const day of daysOf2026)
      expect(localDayStart(zone, day) % (BUCKET_SECONDS * 1000)).toBe(0);
  });
});
