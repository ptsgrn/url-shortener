import { dev } from '$app/env';
import { error } from '@sveltejs/kit';

// A preview with sample data until `/me` reports bans; then the app sends banned users here.
export const load = () => {
	if (!dev) error(404);
};
