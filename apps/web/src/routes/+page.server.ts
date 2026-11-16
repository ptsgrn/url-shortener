import { redirect } from '@sveltejs/kit';
import { apiFor } from '#lib/api.ts';
import { unwrap } from '#lib/errors.ts';
import { PAGE_SIZE } from '#lib/links.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, fetch }) => {
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	const links = unwrap(
		await apiFor(fetch, url.origin).v1.links.get({ query: { limit: PAGE_SIZE } })
	);
	return { links };
};
