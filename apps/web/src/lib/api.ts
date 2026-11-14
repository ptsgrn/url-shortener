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
