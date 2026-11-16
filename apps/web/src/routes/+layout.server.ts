import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Routes a suspended account can still use; short links work for any visitor.
const openToSuspended = new Set(['/banned', '/contact', '/login', '/[code]']);

export const load: LayoutServerLoad = ({ locals, route }) => {
	if (locals.user?.suspended && !openToSuspended.has(route.id ?? '')) redirect(303, '/banned');
	return { user: locals.user };
};

export const prerender = false;
