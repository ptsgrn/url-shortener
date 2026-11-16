import { apiFor, type Rule } from '#lib/api.ts';
import { unwrap } from '#lib/errors.ts';
import type { PageServerLoad } from './$types';

/** The API's largest page of rules. */
const LIMIT = 100;

export const load: PageServerLoad = async ({ url, fetch }) => {
	const api = apiFor(fetch, url.origin);
	// The editor saves whole lists, so it needs every rule, not one page.
	const rules: Rule[] = [];
	for (;;) {
		const page = unwrap(await api.v1.rules.get({ query: { offset: rules.length, limit: LIMIT } }));
		rules.push(...page);
		if (page.length < LIMIT) return { rules };
	}
};
