import { dev } from '$app/env';
import { deps } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	// Mirrors gates 1 and 2 of the API's dev tools (see `api/dev`'s guard); the
	// API still re-checks every request. `dev` is false in production builds.
	devTools: dev && deps.env.DEV_TOOLS === 'true'
});
