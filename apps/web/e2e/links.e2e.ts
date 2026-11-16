import type { Page } from '@playwright/test';
import { allowDomain, expect, settled, test } from './fixtures.ts';

const target = 'https://www.chula.ac.th/e2e/some/long/path';

test.beforeAll(async ({ baseURL }) => {
	await allowDomain(baseURL!, '*.chula.ac.th');
});

test.beforeEach(async ({ page, signIn }) => {
	await signIn();
	await page.goto('/');
});

test('shortens a URL and shows the success dialog', async ({ page, baseURL }) => {
	await page.getByLabel('วางลิงก์ URL').fill(target);
	await page.getByRole('button', { name: 'สร้างลิงก์' }).click();

	const dialog = await settled(page.getByRole('dialog'));
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
	await expect(page.getByLabel('วางลิงก์ URL')).toHaveValue('');
	const card = page.getByRole('article').filter({ hasText: code });
	await expect(card).toContainText(target);
});

test('copies the short link', async ({ page, baseURL }) => {
	await page.getByLabel('วางลิงก์ URL').fill(target);
	await page.getByRole('button', { name: 'สร้างลิงก์' }).click();

	const dialog = await settled(page.getByRole('dialog'));
	const shortUrl = (await dialog.getByText(`${baseURL}/`).textContent())!.trim();
	await dialog.getByRole('button', { name: 'คัดลอก' }).click();

	await expect(page.getByText('คัดลอกแล้ว')).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shortUrl);
});

test('reopens the QR code from a recent link', async ({ page }) => {
	await page.getByLabel('วางลิงก์ URL').fill(target);
	await page.getByRole('button', { name: 'สร้างลิงก์' }).click();
	await (await settled(page.getByRole('dialog'))).getByRole('button', { name: 'Close' }).click();

	await page.getByRole('article').getByRole('button', { name: 'qrcode' }).click();

	await expect(page.getByRole('dialog').getByRole('heading', { name: 'QR Code' })).toBeVisible();
});

async function create(page: Page, code?: string) {
	await page.getByLabel('วางลิงก์ URL').fill(target);
	if (code) await page.getByLabel('ลิงก์ URL ใหม่').fill(code);
	await page.getByRole('button', { name: 'สร้างลิงก์' }).click();
	await expect(page.getByRole('heading', { name: 'สร้างลิงก์สำเร็จ!' })).toBeVisible();
	await (await settled(page.getByRole('dialog'))).getByRole('button', { name: 'Close' }).click();
}

const uniqueCode = () => `e2e-${crypto.randomUUID().slice(0, 8)}`;

test('creates a link with a custom code, and refuses a taken one', async ({ page }) => {
	const code = uniqueCode();
	await create(page, code);
	await expect(page.getByRole('article').filter({ hasText: `/${code}` })).toBeVisible();

	await page.getByLabel('วางลิงก์ URL').fill(target);
	await page.getByLabel('ลิงก์ URL ใหม่').fill(code);
	await page.getByRole('button', { name: 'สร้างลิงก์' }).click();
	await expect(page.getByText('ชื่อลิงก์นี้ถูกใช้แล้ว ลองชื่ออื่น')).toBeVisible();
});

test('the short link redirects, and stops once turned off', async ({ page }) => {
	const code = uniqueCode();
	await create(page, code);

	const open = () => page.request.get(`/${code}`, { maxRedirects: 0 });
	const res = await open();
	expect(res.status()).toBe(302);
	expect(res.headers().location).toBe(target);

	const card = page.getByRole('article').filter({ hasText: `/${code}` });
	await card.getByRole('button', { name: 'ปิดใช้งาน' }).click();
	await expect(card.getByText('ปิดใช้งาน', { exact: true }).first()).toBeVisible();
	await expect(card.getByRole('button', { name: 'เปิดใช้งาน' })).toBeVisible();
	expect((await open()).status()).toBe(404);

	await page.goto(`/${code}`);
	await expect(page.getByText('ไม่พบลิงก์ดังกล่าว หรือลิงก์อาจถูกปิดใช้งานไปแล้ว')).toBeVisible();
});

test('edits a link destination', async ({ page }) => {
	const code = uniqueCode();
	await create(page, code);
	const card = page.getByRole('article').filter({ hasText: `/${code}` });

	await card.getByRole('button', { name: 'แก้ไข' }).click();
	const dialog = await settled(page.getByRole('dialog'));
	await dialog.getByLabel('ลิงก์ปลายทาง').fill(`${target}/edited`);
	await dialog.getByRole('button', { name: 'บันทึก' }).click();

	await expect(card).toContainText(`${target}/edited`);
	await page.reload();
	await expect(page.getByRole('article').filter({ hasText: `/${code}` })).toContainText(
		`${target}/edited`
	);
});

test('deletes a link after confirming', async ({ page }) => {
	const code = uniqueCode();
	await create(page, code);
	const card = page.getByRole('article').filter({ hasText: `/${code}` });

	await card.getByRole('button', { name: 'ลบ' }).click();
	await (await settled(page.getByRole('dialog'))).getByRole('button', { name: 'ลบ' }).click();

	await expect(page.getByText('ลบลิงก์แล้ว')).toBeVisible();
	await expect(card).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole('article').filter({ hasText: `/${code}` })).toHaveCount(0);
});

test('shows visit stats', async ({ page }) => {
	const code = uniqueCode();
	await create(page, code);
	await page.request.get(`/${code}`, { maxRedirects: 0 });

	await page
		.getByRole('article')
		.filter({ hasText: `/${code}` })
		.getByRole('button', { name: 'สถิติการเข้าชม' })
		.click();

	const dialog = await settled(page.getByRole('dialog'));
	await expect(dialog.getByRole('heading', { name: `สถิติการเข้าชม /${code}` })).toBeVisible();
	await expect(dialog.getByText('การเข้าชม 30 วัน', { exact: true }).locator('..')).toContainText(
		'1'
	);
	await expect(dialog.getByText('แบ่งตามอุปกรณ์')).toBeVisible();
});

test('switches the stats range', async ({ page }) => {
	const code = uniqueCode();
	await create(page, code);
	await page
		.getByRole('article')
		.filter({ hasText: `/${code}` })
		.getByRole('button', { name: 'สถิติการเข้าชม' })
		.click();

	const dialog = await settled(page.getByRole('dialog'));
	await expect(dialog.getByText('การเข้าชม 30 วัน', { exact: true })).toBeVisible();
	await dialog.getByRole('button', { name: '7 วัน' }).click();
	await expect(dialog.getByRole('button', { name: '7 วัน' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(dialog.getByText('การเข้าชม 7 วัน', { exact: true })).toBeVisible();
	await expect(dialog.getByRole('heading', { name: 'การเข้าชม 7 วันล่าสุด' })).toBeVisible();
	await dialog.getByRole('button', { name: 'ทั้งหมด' }).click();
	await expect(dialog.getByText('การเข้าชมทั้งหมด', { exact: true })).toBeVisible();
});
