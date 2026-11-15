import { expect, test } from './fixtures.ts';

test('unknown pages render the 404 page', async ({ page }) => {
	const res = await page.goto('/this-page-does-not-exist');

	expect(res?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: /Page not found/ })).toBeVisible();
	await page.getByRole('link', { name: 'กลับหน้าหลัก' }).click();
	await expect(page).toHaveURL(/\/login/);
});

test('contact page is public', async ({ page }) => {
	await page.goto('/contact');

	await expect(page.getByRole('heading', { name: 'ติดต่อเรา' })).toBeVisible();
	await expect(page.getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/);
});
