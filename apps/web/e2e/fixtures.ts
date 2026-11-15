import { test as base, expect } from '@playwright/test';

type Role = 'user' | 'admin';

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
