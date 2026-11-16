import { apiFor } from '#lib/api.ts';
import { unwrap } from '#lib/errors.ts';
import { PAGE_SIZE } from '#lib/links.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, fetch }) => ({
	entries: unwrap(
		await apiFor(fetch, url.origin).v1.admin.audit.get({ query: { limit: PAGE_SIZE } })
	)
});
