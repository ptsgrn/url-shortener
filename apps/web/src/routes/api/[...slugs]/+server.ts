import { app } from 'api';
import type { RequestHandler } from './$types';

// Mount the Elysia app from `apps/api`: every method on /api/* is handled by Elysia.
export const fallback: RequestHandler = ({ request }) => app.handle(request);
