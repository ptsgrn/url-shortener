import { accountContext, allowDomain, expect, settled, test } from './fixtures.ts';

const target = 'https://www.chula.ac.th/e2e/admin';

test.beforeAll(async ({ baseURL }) => {
	await allowDomain(baseURL!, '*.chula.ac.th');
});

test('the admin area is hidden from other accounts', async ({ page, signIn }) => {
	await signIn('user');

	const res = await page.goto('/admin');
	expect(res?.status()).toBe(404);
	await page.getByRole('button', { name: 'Menu' }).click();
	await expect(page.getByRole('link', { name: 'ผู้ดูแลระบบ' })).toHaveCount(0);
});

test('admins reach every admin page from the menu', async ({ page, signIn }) => {
	await signIn('admin');
	await page.goto('/');

	await page.getByRole('button', { name: 'Menu' }).click();
	await (
		await settled(page.getByRole('dialog'))
	)
		.getByRole('link', { name: 'ผู้ดูแลระบบ' })
		.click();
	await expect(page.getByRole('heading', { name: 'สวัสดีคุณ Admin' })).toBeVisible();

	for (const [link, heading] of [
		['รายการลิงก์ทั้งหมด', 'รายการลิงก์ทั้งหมด'],
		['บัญชีผู้ใช้', 'บัญชีผู้ใช้'],
		['การตั้งค่า', 'การตั้งค่า'],
		['ประวัติการดำเนินการ', 'ประวัติการดำเนินการ']
	]) {
		await page.goto('/admin');
		await page.getByRole('link', { name: link }).click();
		await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
	}
});

test("bans another user's link with a reason", async ({ page, signIn, baseURL }) => {
	const { ctx, user } = await accountContext(baseURL!);
	const code = `e2e-ban-${crypto.randomUUID().slice(0, 8)}`;
	expect((await ctx.post('/api/v1/links', { data: { url: target, code } })).ok()).toBeTruthy();
	await ctx.dispose();

	await signIn('admin');
	await page.goto(`/admin/links?owner=${user.id}`);
	const card = page.getByRole('article').filter({ hasText: `/${code}` });
	await expect(card).toContainText(user.name);

	await card.getByRole('button', { name: 'ระงับ' }).click();
	const dialog = await settled(page.getByRole('dialog'));
	await dialog.getByLabel('เหตุผล').fill('สแปม');
	await dialog.getByRole('button', { name: 'ระงับ' }).click();

	await expect(card).toContainText('ถูกระงับ: สแปม');
	expect((await page.request.get(`/${code}`, { maxRedirects: 0 })).status()).toBe(404);

	await page.goto('/admin/audit');
	await expect(
		page
			.getByRole('listitem')
			.filter({ hasText: `/${code}` })
			.first()
	).toContainText('ระงับลิงก์');
});

test('suspending an account sends it to the banned page', async ({ page, signIn, baseURL }) => {
	const victim = await signIn('user');
	await page.goto('/');

	const { ctx } = await accountContext(baseURL!, 'admin');
	const res = await ctx.post(`/api/v1/admin/users/${victim.id}/suspension`, {
		data: { reason: 'e2e' }
	});
	expect(res.ok()).toBeTruthy();
	await ctx.dispose();

	await page.goto('/');
	await expect(page).toHaveURL('/banned');
	await expect(page.getByRole('heading', { name: 'คุณโดนแบน' })).toBeVisible();
	await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
	await expect(page).toHaveURL('/login');
});

test('suspends and restores a user from the users page', async ({ page, signIn, baseURL }) => {
	const name = `E2E target ${crypto.randomUUID().slice(0, 8)}`;
	const { ctx } = await accountContext(baseURL!, 'user', name);
	await ctx.dispose();

	await signIn('admin');
	await page.goto(`/admin/users?q=${encodeURIComponent(name)}`);
	const card = page.getByRole('article').filter({ hasText: name });

	await card.getByRole('button', { name: 'แบน' }).click();
	const suspend = await settled(page.getByRole('dialog'));
	await suspend.getByLabel('เหตุผล').fill('ทดสอบ');
	await suspend.getByRole('button', { name: 'แบน' }).click();
	await expect(card).toContainText('ถูกระงับ');
	await expect(card).toContainText('เหตุผล: ทดสอบ');

	await card.getByRole('button', { name: 'ยกเลิกแบน' }).click();
	await (
		await settled(page.getByRole('dialog'))
	)
		.getByRole('button', { name: 'ยกเลิกแบน' })
		.click();
	await expect(card.getByRole('button', { name: 'แบน' })).toBeVisible();
});

test("changes a link's owner", async ({ page, signIn, baseURL }) => {
	const from = await accountContext(baseURL!);
	const to = await accountContext(
		baseURL!,
		'user',
		`E2E new owner ${crypto.randomUUID().slice(0, 8)}`
	);
	const code = `e2e-own-${crypto.randomUUID().slice(0, 8)}`;
	expect((await from.ctx.post('/api/v1/links', { data: { url: target, code } })).ok()).toBeTruthy();
	await from.ctx.dispose();
	await to.ctx.dispose();

	await signIn('admin');
	await page.goto(`/admin/links?q=${code}`);
	const card = page.getByRole('article').filter({ hasText: `/${code}` });
	await card.getByRole('button', { name: 'เปลี่ยนเจ้าของ' }).click();

	const dialog = await settled(page.getByRole('dialog'));
	await dialog.getByLabel('ค้นหาผู้ใช้').fill(to.user.name);
	await dialog.getByRole('radio', { name: new RegExp(to.user.name) }).check();
	await dialog.getByRole('button', { name: 'เปลี่ยนเจ้าของ' }).click();

	await expect(card).toContainText(`โดย ${to.user.name}`);
	await page.goto(`/admin/links?owner=${to.user.id}`);
	await expect(page.getByRole('article').filter({ hasText: `/${code}` })).toBeVisible();
});

test('lists deleted links on their own', async ({ page, signIn, baseURL }) => {
	const { ctx, user } = await accountContext(baseURL!);
	const code = `e2e-del-${crypto.randomUUID().slice(0, 8)}`;
	expect((await ctx.post('/api/v1/links', { data: { url: target, code } })).ok()).toBeTruthy();
	expect((await ctx.delete(`/api/v1/links/${code}`)).status()).toBe(204);
	await ctx.dispose();

	await signIn('admin');
	await page.goto(`/admin/links?owner=${user.id}`);
	await expect(page.getByRole('article').filter({ hasText: `/${code}` })).toHaveCount(0);

	await page.goto(`/admin/links?owner=${user.id}&deleted=1`);
	const card = page.getByRole('article').filter({ hasText: `/${code}` });
	await expect(card).toContainText('ลบแล้ว');
	await expect(card.getByRole('button', { name: 'แก้ไข' })).toHaveCount(0);
});

test("shows an account's page and its audit history", async ({ page, signIn, baseURL }) => {
	const name = `E2E detail ${crypto.randomUUID().slice(0, 8)}`;
	const { ctx, user } = await accountContext(baseURL!, 'user', name);
	expect((await ctx.post('/api/v1/links', { data: { url: target } })).ok()).toBeTruthy();
	await ctx.dispose();

	await signIn('admin');
	await page.goto(`/admin/users?q=${encodeURIComponent(name)}`);
	await page.getByRole('link', { name }).click();
	await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
	await expect(page.getByText('ลิงก์ทั้งหมด').locator('..')).toContainText('1');

	await page.getByRole('button', { name: 'แบนบัญชีนี้' }).click();
	const dialog = await settled(page.getByRole('dialog'));
	await dialog.getByLabel('เหตุผล').fill('ทดสอบหน้าบัญชี');
	await dialog.getByRole('button', { name: 'แบน' }).click();
	await expect(page.getByText('ทดสอบหน้าบัญชี')).toBeVisible();

	await page.getByRole('link', { name: 'ประวัติการดำเนินการกับบัญชีนี้' }).click();
	await expect(page).toHaveURL(`/admin/audit?target=${user.id}`);
	await expect(page.getByRole('link', { name: `กับ ${name} ✕` })).toBeVisible();
	await expect(page.getByRole('listitem').first()).toContainText('ระงับบัญชี');
});

test('adds and removes a domain rule', async ({ page, signIn }) => {
	const pattern = `e2e-${crypto.randomUUID().slice(0, 8)}.example.com`;
	const blacklist = page.getByRole('region', { name: 'blacklist' });
	const patterns = () =>
		blacklist
			.getByRole('textbox')
			.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

	await signIn('admin');
	await page.goto('/admin/settings');
	await blacklist.getByRole('button', { name: 'เพิ่ม' }).click();
	await blacklist.getByRole('textbox').last().fill(pattern);
	await blacklist.getByRole('button', { name: 'บันทึก' }).click();
	await expect(page.getByText('บันทึกแล้ว')).toBeVisible();

	await page.reload();
	await expect.poll(patterns).toContain(pattern);

	const index = (await patterns()).indexOf(pattern);
	await blacklist.getByRole('button', { name: 'ลบ' }).nth(index).click();
	await blacklist.getByRole('button', { name: 'บันทึก' }).click();
	await expect(page.getByText('บันทึกแล้ว')).toBeVisible();

	await page.reload();
	await expect.poll(patterns).not.toContain(pattern);
});
