import { dev } from '$app/env';
import { env } from 'cloudflare:workers';
import { createApp, type Deps } from 'api';
import { createDb } from 'api/db';

/**
 * The API's dependencies, built once per isolate. `env` from `cloudflare:workers`
 * is available at module scope on Workers and emulated by the adapter in `vite dev`.
 */
export const deps: Deps = { db: createDb(env.DB), env };

/**
 * The Elysia app from `apps/api`, with dependencies injected.
 * In `vite dev` it also serves the OpenAPI UI at /api/openapi.
 */
export const app = createApp(deps, { openapi: dev });

/** Peer address of each request, recorded by the `/api` route for the dev tools' guard. */
export const clientIPs = new WeakMap<Request, string>();

// Dev-only sign-in helpers at /api/dev (needs DEV_TOOLS=true in .dev.vars).
// `dev` is a build-time constant: production builds drop this branch, and the
// dynamic import keeps the dev module out of the bundle entirely.
if (dev) {
	const { mountDevTools } = await import('api/dev');
	mountDevTools(app, deps, { clientIP: (request) => clientIPs.get(request) });
}
