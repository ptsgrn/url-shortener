import type { Cookie } from "elysia";
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from "./token.ts";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

export interface CookieOptions {
  path: string;
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
}

/**
 * The minimal cookie API the auth domain needs. SvelteKit's `event.cookies`
 * satisfies it directly; Elysia's cookie context is adapted by `elysiaCookieJar`.
 */
export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  delete(name: string, options: { path: string }): void;
}

const base = (secure: boolean) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure,
});

export const cookieOptions = (secure: boolean) => ({
  access: { ...base(secure), path: "/", maxAge: ACCESS_TOKEN_TTL },
  // "/" (not "/api/v1/auth") so SvelteKit's `handle` hook can refresh during
  // SSR page loads too. It is httpOnly, so scripts never see it.
  refresh: { ...base(secure), path: "/", maxAge: REFRESH_TOKEN_TTL },
  /** Short-lived OAuth handshake cookies (state, PKCE verifier, redirect). */
  oauth: { ...base(secure), path: "/api/v1/auth", maxAge: 10 * 60 },
});

export const isSecure = (request: Request) =>
  new URL(request.url).protocol === "https:";

export const elysiaCookieJar = (
  cookie: Record<string, Cookie<unknown>>,
): CookieJar => ({
  get: (name) => cookie[name]?.value as string | undefined,
  set: (name, value, options) => cookie[name]!.set({ value, ...options }),
  delete: (name, { path }) => cookie[name]!.set({ value: "", path, maxAge: 0 }),
});
