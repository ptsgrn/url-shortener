import { dev } from '$app/env';
import { deps } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	devTools: dev && deps.env.DEV_TOOLS === 'true'
});
