import { Auth } from 'api/auth';
import { deps } from '#lib/server/app.ts';
import type { Handle } from '@sveltejs/kit/hooks';

// API routes authenticate themselves (see the API's auth service). Page loads
// resolve the user here, refreshing the session if the access token expired.
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = event.url.pathname.startsWith('/api/')
		? null
		: // Any error (no session, expired, internal) renders the page signed out;
			// internal errors are already logged by the API.
			await Auth.sessionUser(deps, event.cookies, event.url.protocol === 'https:').unwrapOr(null);
	return resolve(event);
};
