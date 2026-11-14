import { browser } from '$app/env';
import { treaty } from '@elysiajs/eden';
import type { App } from 'api';

/** Browser client: type-safe HTTP calls to the Elysia routes mounted at /api. */
export const api = treaty<App>(browser ? location.origin : 'http://localhost').api;
