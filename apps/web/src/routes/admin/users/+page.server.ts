import { apiFor } from '#lib/api.ts';
import { unwrap } from '#lib/errors.ts';
import { PAGE_SIZE } from '#lib/links.ts';
import type { PageServerLoad } from './$types';

const statuses = ['active', 'suspended'] as const;

export const load: PageServerLoad = async ({ url, fetch }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = statuses.find((s) => s === url.searchParams.get('status'));
	const users = unwrap(
		await apiFor(fetch, url.origin).v1.admin.users.get({
			query: { q: q || undefined, status, limit: PAGE_SIZE }
		})
	);
	return { users, filters: { q, status: status ?? null } };
};
