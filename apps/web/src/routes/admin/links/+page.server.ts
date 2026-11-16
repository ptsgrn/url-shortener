import { apiFor } from '#lib/api.ts';
import { unwrap } from '#lib/errors.ts';
import { PAGE_SIZE } from '#lib/links.ts';
import type { PageServerLoad } from './$types';

const statuses = ['active', 'disabled', 'banned', 'blocked'] as const;

export const load: PageServerLoad = async ({ url, fetch }) => {
	const api = apiFor(fetch, url.origin);
	const q = url.searchParams.get('q') ?? '';
	const status = statuses.find((s) => s === url.searchParams.get('status'));
	const ownerId = url.searchParams.get('owner') ?? undefined;
	// Only deleted links, or none of them: the API has no "both".
	const deleted = url.searchParams.get('deleted') === '1' || undefined;

	const [links, owner] = await Promise.all([
		api.v1.admin.links
			.get({ query: { q: q || undefined, status, ownerId, deleted, limit: PAGE_SIZE } })
			.then(unwrap),
		ownerId ? api.v1.admin.users({ id: ownerId }).get().then(unwrap) : null
	]);
	return { links, owner, filters: { q, status: status ?? null, ownerId, deleted: !!deleted } };
};
