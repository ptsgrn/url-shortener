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
