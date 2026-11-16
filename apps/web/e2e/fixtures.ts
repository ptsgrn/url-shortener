import { test as base, expect, request, type APIRequestContext } from '@playwright/test';

type Role = 'user' | 'admin';

/**
 * Whitelists a domain pattern (e.g. `*.example.com`), signing in as a new
 * admin in a separate context. Links are blocked unless their host matches a
 * whitelist rule, and a fresh database has none.
 */
export async function allowDomain(baseURL: string, pattern: string) {
	const admin: APIRequestContext = await request.newContext({ baseURL });
	try {
		const signIn = await admin.post('/api/dev/users', { data: { role: 'admin' } });
		expect(signIn.ok(), 'dev sign-in needs DEV_TOOLS=true in .dev.vars').toBeTruthy();
		const res = await admin.post('/api/v1/rules', { data: { list: 'whitelist', pattern } });
		// 409: already whitelisted by an earlier run.
		expect([201, 409]).toContain(res.status());
	} finally {
		await admin.dispose();
	}
}

export const test = base.extend<{
	signIn: (role?: Role) => Promise<{ id: string; name: string }>;
}>({
	// Clicks before hydration hit plain HTML (a form submits natively, a menu
	// does nothing), so every full page load waits for the root layout to mount.
	page: async ({ page }, use) => {
		const goto = page.goto.bind(page);
		page.goto = async (url, options) => {
			const res = await goto(url, options);
			await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
			return res;
		};
		await use(page);
	},

	signIn: async ({ page }, use) => {
		// `page.request` shares the browser context's cookies, so the session
		// cookies the dev tools set apply to the page too.
		await use(async (role = 'user') => {
			const name = `E2E ${role} ${crypto.randomUUID().slice(0, 8)}`;
			const res = await page.request.post('/api/dev/users', { data: { name, role } });
			expect(res.ok(), 'dev sign-in needs DEV_TOOLS=true in .dev.vars').toBeTruthy();
			return res.json();
		});
	}
});

export { expect };
