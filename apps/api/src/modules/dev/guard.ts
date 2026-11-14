import type { AuthEnv } from "../../utils/deps.ts";

/**
 * Dev tools mint sessions for any user without credentials, so they are
 * gated by several independent checks; each one alone keeps them off:
 *
 *  1. The host only calls `mountDevTools` in development (`dev` from
 *     `$app/env` in SvelteKit, `NODE_ENV !== "production"` standalone).
 *  2. `DEV_TOOLS=true` must be set in the env (`.dev.vars` only; never as a
 *     Wrangler var or secret), or the routes are not registered at all.
 *  3. Every request re-checks the flag, and the request must target a
 *     loopback host and (when the runtime exposes it) come from a loopback IP.
 */
export const devToolsEnabled = (env: AuthEnv) => env.DEV_TOOLS === "true";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isLoopbackIP = (ip: string) =>
  ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.");

/** `clientIP`: the peer address, or `undefined` when the host can't tell. */
export const isLocalRequest = (request: Request, clientIP?: string) =>
  LOOPBACK_HOSTS.has(new URL(request.url).hostname) &&
  (clientIP === undefined || isLoopbackIP(clientIP));
