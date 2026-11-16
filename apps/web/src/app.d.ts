// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: import('api/auth').SessionUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}: adapter-cloudflare 8 passes no `platform`;
		// use `env` and `waitUntil` from 'cloudflare:workers' instead.
	}
}

export {};
