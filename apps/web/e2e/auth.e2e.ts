import { expect, settled, test } from './fixtures.ts';

test('signed-out visitors are sent to login', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveURL('/login?redirectTo=%2F');
	await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'เข้าสู่ระบบด้วย Google' })).toHaveAttribute(
		'href',
		'/api/v1/auth/google?redirectTo=%2F'
	);
});

test('dev sign-in panel creates a user and signs in', async ({ page }) => {
	await page.goto('/login');

	await page.getByPlaceholder('Name (optional)').fill('Panel User');
	await page.getByRole('button', { name: 'Create and sign in' }).click();

	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'วางลิงค์ URL' })).toBeVisible();
});

test('signed-in users skip login and can sign out from the menu', async ({ page, signIn }) => {
	const user = await signIn();

	await page.goto('/login');
	await expect(page).toHaveURL('/');

	await page.getByRole('button', { name: 'Menu' }).click();
	await expect((await settled(page.getByRole('dialog'))).getByText(user.name)).toBeVisible();
	await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

	await expect(page).toHaveURL('/login');
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});
