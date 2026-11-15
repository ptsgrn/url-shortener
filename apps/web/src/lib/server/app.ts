import { building, dev } from '$app/env';
import { env } from 'cloudflare:workers';
import { createApp, type Deps } from 'api';
import { createDb } from 'api/db';

/**
 * Each request's Workers `ExecutionContext`, recorded by the `/api` route.
 * `deps` is built once per isolate, but `ctx` is per request, so the API's
 * `waitUntil` looks it up by the `Request` it is handling.
 */
export const requestContexts = new WeakMap<Request, ExecutionContext>();

/**
 * The API's dependencies, built once per isolate. `env` from `cloudflare:workers`
 * is available at module scope on Workers and emulated by the adapter in `vite dev`.
 * `vite build` imports this module to analyse routes, where reading `env` throws.
 */
export const deps: Deps = {
	db: building ? (null as never) : createDb(env.DB),
	env,
	// Without a recorded ctx (shouldn't happen on Workers) the task still runs,
	// but the isolate may be stopped before it finishes.
	waitUntil: (request, task) => requestContexts.get(request)?.waitUntil(task)
};

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
