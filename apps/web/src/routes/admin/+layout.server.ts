import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	// 404, not 403: don't reveal the admin area to other accounts.
	if (locals.user.role !== 'admin') error(404, 'Not Found');
};
