import { app, clientIPs } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

// Mount the Elysia app from `apps/api`: every method on /api/* is handled by Elysia.
export const fallback: RequestHandler = ({ request, getClientAddress }) => {
	clientIPs.set(request, getClientAddress());
	return app.handle(request);
};
