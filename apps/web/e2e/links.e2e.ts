import { allowDomain, expect, test } from './fixtures.ts';

const target = 'https://www.chula.ac.th/e2e/some/long/path';

test.beforeAll(async ({ baseURL }) => {
	await allowDomain(baseURL!, '*.chula.ac.th');
});

test.beforeEach(async ({ page, signIn }) => {
	await signIn();
	await page.goto('/');
});

test('shortens a URL and shows the success dialog', async ({ page, baseURL }) => {
	await page.getByLabel('วางลิงค์ URL').fill(target);
	await page.getByRole('button', { name: 'สร้างลิงค์' }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'สร้างลิงก์สำเร็จ!' })).toBeVisible();
	await expect(dialog.getByRole('img', { name: /QR code for/ })).toBeVisible();
	await expect(dialog.getByRole('link', { name: 'ดาวน์โหลด QR Code' })).toHaveAttribute(
		'href',
		/^data:image\/png;base64,/
	);

	const shortUrl = await dialog.getByText(`${baseURL}/`).textContent();
	const code = shortUrl!.trim().split('/').pop()!;
	expect(code).toMatch(/^[\w+-]+$/);

	// The API resolves the new code to the original URL.
	const res = await page.request.get(`/api/v1/links/${code}`);
	expect(await res.json()).toMatchObject({ code, url: target });

	await dialog.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByLabel('วางลิงค์ URL')).toHaveValue('');
	const card = page.getByRole('article').filter({ hasText: code });
	await expect(card).toContainText(target);
});

test('copies the short link', async ({ page, baseURL }) => {
	await page.getByLabel('วางลิงค์ URL').fill(target);
	await page.getByRole('button', { name: 'สร้างลิงค์' }).click();

	const dialog = page.getByRole('dialog');
	const shortUrl = (await dialog.getByText(`${baseURL}/`).textContent())!.trim();
	await dialog.getByRole('button', { name: 'คัดลอก' }).click();

	await expect(page.getByText('คัดลอกแล้ว')).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shortUrl);
});

test('reopens the QR code from a recent link', async ({ page }) => {
	await page.getByLabel('วางลิงค์ URL').fill(target);
	await page.getByRole('button', { name: 'สร้างลิงค์' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

	await page.getByRole('article').getByRole('button', { name: 'qrcode' }).click();

	await expect(page.getByRole('dialog').getByRole('heading', { name: 'QR Code' })).toBeVisible();
});

test('rejects a custom code until the API supports it', async ({ page }) => {
	await page.getByLabel('วางลิงค์ URL').fill(target);
	await page.getByLabel('ลิงค์ URL ใหม่').fill('my-link');
	await page.getByRole('button', { name: 'สร้างลิงค์' }).click();

	await expect(page.getByText('ยังไม่รองรับการตั้งชื่อลิงก์เอง', { exact: false })).toBeVisible();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page.getByRole('article')).toHaveCount(0);
});
