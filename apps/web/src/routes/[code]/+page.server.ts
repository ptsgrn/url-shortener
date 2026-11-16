import { error, redirect } from '@sveltejs/kit';
import { app, requestContexts } from '#lib/server/app.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request, url, platform }) => {
	// Forward with the visitor's headers: stats read the user agent and referrer.
	const forwarded = new Request(new URL(`/api/v1/r/${encodeURIComponent(params.code)}`, url), {
		headers: request.headers
	});
	if (platform?.ctx) requestContexts.set(forwarded, platform.ctx);

	const res = await app.handle(forwarded);
	const location = res.headers.get('location');
	// External by design: the API has already checked the destination against the domain rules.
	if (res.status === 302 && location) redirect(302, location, { external: true });
	if (res.status === 404 || res.status === 403)
		error(404, 'ไม่พบลิงก์ดังกล่าว หรือลิงก์อาจถูกปิดใช้งานไปแล้ว');
	error(res.status, 'เกิดข้อผิดพลาด กรุณาลองใหม่');
};
