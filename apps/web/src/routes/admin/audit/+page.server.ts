import { apiFor } from '#lib/api.ts';
import { unwrap } from '#lib/errors.ts';
import { PAGE_SIZE } from '#lib/links.ts';
import type { PageServerLoad } from './$types';

const actions = [
	'user.suspend',
	'user.restore',
	'link.update',
	'link.ban',
	'link.unban',
	'rule.create',
	'rule.update',
	'rule.delete'
] as const;
const targetTypes = ['user', 'link', 'rule'] as const;

export const load: PageServerLoad = async ({ url, fetch }) => {
	const api = apiFor(fetch, url.origin);
	const params = url.searchParams;
	const filters = {
		action: actions.find((a) => a === params.get('action')) ?? null,
		targetType: targetTypes.find((t) => t === params.get('type')) ?? null,
		actorId: params.get('actor'),
		targetId: params.get('target')
	};
	// Names for the actor and target chips; a target that isn't an account has none.
	const nameOf = (id: string | null) =>
		id
			? api.v1.admin
					.users({ id })
					.get()
					.then((res) => (res.data ? (res.data.name ?? res.data.email) : null))
			: null;

	const [entries, actorName, targetName] = await Promise.all([
		api.v1.admin.audit
			.get({
				query: {
					action: filters.action ?? undefined,
					targetType: filters.targetType ?? undefined,
					actorId: filters.actorId ?? undefined,
					targetId: filters.targetId ?? undefined,
					limit: PAGE_SIZE
				}
			})
			.then(unwrap),
		nameOf(filters.actorId),
		nameOf(filters.targetId)
	]);
	return { entries, filters, actorName, targetName };
};
