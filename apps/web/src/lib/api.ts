import { browser } from '$app/env';
import { treaty } from '@elysiajs/eden';
import type { App } from 'api';

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, so parallel 401s don't race the token rotation. */
const refresh = () =>
	(refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST' })
		.then((res) => res.ok)
		.finally(() => (refreshing = null)));

/** On a 401 from a non-auth route, refresh the access token once and retry. */
const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const res = await fetch(input, init);
	const url = new URL(input instanceof Request ? input.url : input, location.origin);
	if (res.status !== 401 || url.pathname.startsWith('/api/v1/auth/')) return res;
	return (await refresh()) ? fetch(input, init) : res;
}) as typeof fetch;

/** Browser client: type-safe HTTP calls to the Elysia routes mounted at /api. */
export const api = treaty<App>(browser ? location.origin : 'http://localhost', {
	fetcher: browser ? fetcher : undefined
}).api;

/**
 * Client for load functions, over SvelteKit's `fetch` so the request carries
 * the visitor's cookies (on the server it calls the `/api` route in-process).
 */
export const apiFor = (fetch: typeof globalThis.fetch, origin: string) =>
	treaty<App>(origin, { fetcher: fetch }).api;

type Data<T> = T extends (...args: never[]) => Promise<{ data: infer D }> ? NonNullable<D> : never;

export type Link = Data<typeof api.v1.links.get>[number];
export type AdminLink = Data<typeof api.v1.admin.links.get>[number];
export type AdminUser = Data<typeof api.v1.admin.users.get>[number];
export type Rule = Data<typeof api.v1.rules.get>[number];
export type AuditEntry = Data<typeof api.v1.admin.audit.get>[number];
export type Stats = Data<ReturnType<typeof api.v1.stats>['get']>;
