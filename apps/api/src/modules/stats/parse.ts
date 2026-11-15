import { UAParser } from "ua-parser-js";

/** Days in stats are Asia/Bangkok calendar days (UTC+7, no DST). */
export const BANGKOK_OFFSET_SECONDS = 7 * 60 * 60;

const DESKTOP_OS = new Set([
  "Windows",
  "Mac OS",
  "Linux",
  "Chromium OS",
  "Ubuntu",
  "Fedora",
  "Debian",
]);

/** Browser name (`Chrome`, `Mobile Safari`, `Line`…); `null` if unrecognized. */
export const browserOf = (ua: string | null | undefined): string | null =>
  (ua && new UAParser(ua).getBrowser().name) || null;

/**
 * `mobile`, `tablet` or `desktop`; `null` if unrecognized. ua-parser leaves
 * `device.type` empty for desktops, so a desktop OS with no type is `desktop`.
 */
export const deviceOf = (ua: string | null | undefined): string | null => {
  if (!ua) return null;
  const parser = new UAParser(ua);
  const type = parser.getDevice().type;
  if (type === "mobile" || type === "tablet") return type;
  if (type) return null;
  const os = parser.getOS().name;
  return os && DESKTOP_OS.has(os) ? "desktop" : null;
};

/** Just the referrer's host (no path or query, which can be private); `null` if absent or not a web URL. */
export const referrerHost = (
  header: string | null | undefined,
): string | null => {
  if (!header) return null;
  try {
    const url = new URL(header);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
};

/** `YYYY-MM-DD` of `date` in Bangkok. */
export const bangkokDay = (date: Date): string =>
  new Date(date.getTime() + BANGKOK_OFFSET_SECONDS * 1000)
    .toISOString()
    .slice(0, 10);

/** Start of Bangkok day `day` (`YYYY-MM-DD`), as a Date. */
export const bangkokDayStart = (day: string): Date =>
  new Date(Date.parse(`${day}T00:00:00Z`) - BANGKOK_OFFSET_SECONDS * 1000);

/** Start of the Bangkok day after `day`: the exclusive end of an inclusive range. */
export const bangkokDayEnd = (day: string): Date =>
  new Date(bangkokDayStart(day).getTime() + 24 * 60 * 60 * 1000);
