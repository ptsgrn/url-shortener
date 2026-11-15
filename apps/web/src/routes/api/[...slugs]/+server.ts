import { app, clientIPs, requestContexts } from '#lib/server/app.ts';
import type { RequestHandler } from './$types';

// Mount the Elysia app from `apps/api`: every method on /api/* is handled by Elysia.
export const fallback: RequestHandler = ({ request, getClientAddress, platform }) => {
	clientIPs.set(request, getClientAddress());
	if (platform?.ctx) requestContexts.set(request, platform.ctx);
	return app.handle(request);
};
