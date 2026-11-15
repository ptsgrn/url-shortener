import { goto, invalidateAll } from '$app/navigation';
import { resolve } from '$app/paths';
import { api } from '#lib/api.ts';

export async function logout() {
	await api.v1.auth.logout.post();
	await invalidateAll();
	await goto(resolve('/login'));
}
