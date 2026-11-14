import { env } from 'cloudflare:workers';
import { createDb, runWithDb } from 'api/db';
import type { Handle } from '@sveltejs/kit/hooks';

// Bind the request's D1 database so Elysia handlers and load functions can use `getDb()`.
// `cloudflare:workers` is the real module on Workers and is emulated by the adapter in `vite dev`.
export const handle: Handle = ({ event, resolve }) =>
	runWithDb(createDb(env.DB), () => resolve(event));
