import { apiFor } from '#lib/api.ts';
import { unwrap } from '#lib/errors.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, fetch }) => ({
	account: unwrap(await apiFor(fetch, url.origin).v1.admin.users({ id: params.id }).get())
});
