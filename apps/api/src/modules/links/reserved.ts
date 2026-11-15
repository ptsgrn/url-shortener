/**
 * Codes a user can't choose: `chula.me/{code}` would clash with one of the
 * web app's own paths (FR-05). Compared case-insensitively, so `API` or
 * `Login` can't pose as them either. Add a name here whenever `apps/web`
 * gains a top-level route.
 */
const RESERVED = new Set([
  // apps/web routes and SvelteKit's build assets
  "api",
  "login",
  "logout",
  "_app",
  "app",
  // likely future pages
  "admin",
  "dashboard",
  "setting",
  "settings",
  "account",
  "links",
  "link",
  "stats",
  "help",
  "about",
  "terms",
  "privacy",
  "static",
  "assets",
]);

export const isReservedCode = (code: string) =>
  RESERVED.has(code.toLowerCase());
