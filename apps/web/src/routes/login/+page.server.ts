import { dev } from '$app/env';
import { redirect } from '@sveltejs/kit';
import { deps } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { devTools: dev && deps.env.DEV_TOOLS === 'true' };
};
