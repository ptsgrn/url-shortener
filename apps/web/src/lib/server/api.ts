import { treaty } from '@elysiajs/eden';
import { app } from 'api';

/** Server-side client: calls the Elysia app in-process, no HTTP round trip. */
export const api = treaty(app).api;
