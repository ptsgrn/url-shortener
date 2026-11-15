/**
 * Calendar days in an IANA time zone, for stats (FR-11). Visits are stored
 * as UTC instants; these helpers decide which local day an instant falls on
 * and when a local day starts, using the runtime's time-zone database
 * (`Intl`), so daylight-saving changes are handled per instant.
 */

/** Width of the UTC buckets visits are grouped in before being assigned to local days. */
export const BUCKET_SECONDS = 15 * 60;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** `YYYY-MM-DD HH:mm:ss` parts of an instant in `zone` (cached per zone). */
const formatter = (zone: string) => {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, f);
  }
  return f;
};

const partsOf = (zone: string, at: number) => {
  const parts: Record<string, string> = {};
  for (const p of formatter(zone).formatToParts(at)) parts[p.type] = p.value;
  return parts as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second",
    string
  >;
};

/**
 * Time zone `input` as the runtime names it (`asia/bangkok` → `Asia/Bangkok`,
 * `utc` → `UTC`), or `undefined` if it's unknown. UTC offsets like `+07:00`
 * are refused even though `Intl` accepts them: an offset that isn't a
 * multiple of 15 minutes would break the 15-minute buckets, and a fixed
 * offset is rarely what a viewer's day really is.
 */
export const parseTimeZone = (input: string): string | undefined => {
  if (/^[+-]/.test(input.trim())) return undefined;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: input,
    }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/** The local calendar day (`YYYY-MM-DD`) of instant `at` (ms) in `zone`. */
export const localDay = (zone: string, at: number): string => {
  const { year, month, day } = partsOf(zone, at);
  return `${year}-${month}-${day}`;
};

/** `zone`'s offset from UTC at instant `at`, in ms (Bangkok: +7 h). */
const offsetAt = (zone: string, at: number): number => {
  const p = partsOf(zone, at);
  const asUtc = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  );
  return asUtc - Math.floor(at / 1000) * 1000;
};

/** The day after `day` (`YYYY-MM-DD`). */
export const nextDay = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * The UTC instant (ms) at which local day `day` starts in `zone`: normally
 * local midnight. If midnight doesn't exist that day (clocks jump forward at
 * 00:00), the first instant that is on `day`.
 */
export const localDayStart = (zone: string, day: string): number => {
  const midnightAsUtc = Date.parse(`${day}T00:00:00Z`);
  // Midnight under the offset in force just before and just after it; on a
  // day with a change at midnight these differ.
  const before = midnightAsUtc - offsetAt(zone, midnightAsUtc - 86_400_000 / 2);
  const after = midnightAsUtc - offsetAt(zone, before);
  const onDay = [before, after]
    .sort((a, b) => a - b)
    .filter((at) => localDay(zone, at) === day);
  // Both candidates fall on `day` when midnight happens twice (clocks go
  // back at 00:00): the earlier one starts the day.
  return onDay[0] ?? Math.max(before, after);
};
