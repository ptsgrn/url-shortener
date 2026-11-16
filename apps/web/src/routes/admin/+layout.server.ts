import { dev } from '$app/env';
import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// The API doesn't expose roles or admin endpoints yet, so these pages are
// dev-only previews over sample data (see `./sample.ts`).
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!dev) error(404);
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
};
