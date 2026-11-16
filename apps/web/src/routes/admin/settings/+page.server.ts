import { apiFor } from '#lib/api.ts';
import { unwrap } from '#lib/errors.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, fetch }) => ({
	// 100 is the API's page limit; more rules than that would need paging here.
	rules: unwrap(await apiFor(fetch, url.origin).v1.rules.get({ query: { limit: 100 } }))
});
