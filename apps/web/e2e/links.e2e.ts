import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { allowDomain, expect, settled, test } from './fixtures.ts';
import { decodeQr, decodeQrDataUrl } from './qr.ts';

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

/** Creates a link through the form and returns its short URL from the success dialog. */
async function createAndRead(page: Page, baseURL: string, code?: string) {
	await page.getByLabel('วางลิงก์ URL').fill(target);
	if (code) await page.getByLabel('ลิงก์ URL ใหม่').fill(code);
	await page.getByRole('button', { name: 'สร้างลิงก์' }).click();
	const dialog = await settled(page.getByRole('dialog'));
	const shortUrl = (await dialog.getByText(`${baseURL}/`).textContent())!.trim();
	return { dialog, shortUrl, code: shortUrl.slice(`${baseURL}/`.length) };
}

test('FR-10: the downloaded QR code encodes the short link, not the destination', async ({
	page,
	baseURL
}) => {
	const { dialog, shortUrl, code } = await createAndRead(page, baseURL!);

	const shown = await dialog.getByRole('img', { name: /QR code for/ }).getAttribute('src');
	expect(decodeQrDataUrl(shown!)).toBe(shortUrl);

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		dialog.getByRole('link', { name: 'ดาวน์โหลด QR Code' }).click()
	]);
	expect(download.suggestedFilename()).toBe(`microl-${code}.png`);
	const png = await readFile(await download.path());
	expect(png.subarray(1, 4).toString()).toBe('PNG');
	const decoded = decodeQr(png);
	expect(decoded).toBe(shortUrl);
	expect(decoded).not.toBe(target);
});

test('FR-10: the QR code from a recent link encodes that link', async ({ page, baseURL }) => {
	const code = uniqueCode();
	await create(page, code);
	await page
		.getByRole('article')
		.filter({ hasText: `/${code}` })
		.getByRole('button', { name: 'qrcode' })
		.click();

	const dialog = await settled(page.getByRole('dialog'));
	const src = await dialog.getByRole('img', { name: /QR code for/ }).getAttribute('src');
	expect(decodeQrDataUrl(src!)).toBe(`${baseURL}/${code}`);
});

test('FR-05: generates a random code when none is given', async ({ page, baseURL }) => {
	const codes: string[] = [];
	for (let i = 0; i < 2; i++) {
		const { dialog, code } = await createAndRead(page, baseURL!);
		codes.push(code);
		await dialog.getByRole('button', { name: 'Close' }).click();
	}

	for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9_-]{7}$/);
	expect(codes[0]).not.toBe(codes[1]);

	const res = await page.request.get(`/${codes[0]}`, { maxRedirects: 0 });
	expect(res.status()).toBe(302);
	expect(res.headers().location).toBe(target);
});

test('FR-06: pages through many links with "ดูเพิ่มเติม"', async ({ page }) => {
	const total = 25;
	const created = await Promise.all(
		Array.from({ length: total }, async (_, i) => {
			const res = await page.request.post('/api/v1/links', { data: { url: `${target}/${i}` } });
			expect(res.ok()).toBeTruthy();
			return ((await res.json()) as { code: string }).code;
		})
	);
	await page.goto('/');

	const cards = page.getByRole('article');
	const more = page.getByRole('button', { name: 'ดูเพิ่มเติม' });
	await expect(cards).toHaveCount(20);
	await more.click();
	await expect(cards).toHaveCount(total);
	await expect(more).toHaveCount(0);

	// Every link exactly once across both pages.
	const shown = (await cards.allTextContents()).map((text) => text.match(/\/([\w-]{7})/)?.[1]);
	expect(new Set(shown)).toEqual(new Set(created));
});
