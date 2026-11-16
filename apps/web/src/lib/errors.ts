import { error } from '@sveltejs/kit';

const messages: Record<string, string> = {
	AUTH_UNAUTHORIZED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
	AUTH_FORBIDDEN: 'คุณไม่มีสิทธิ์ทำรายการนี้',
	LINK_NOT_FOUND: 'ไม่พบลิงก์ดังกล่าว',
	LINK_BLOCKED: 'ไม่อนุญาตให้สร้างลิงก์ไปยังเว็บไซต์นี้',
	LINK_DISABLED: 'ลิงก์นี้ถูกปิดใช้งาน',
	LINK_BANNED: 'ลิงก์นี้ถูกระงับโดยผู้ดูแลระบบ',
	LINK_CODE_TAKEN: 'ชื่อลิงก์นี้ถูกใช้แล้ว ลองชื่ออื่น',
	LINK_OWNER_NOT_FOUND: 'ไม่พบผู้ใช้ที่ระบุ',
	LINK_OWNER_CHANGE_FORBIDDEN: 'เฉพาะผู้ดูแลระบบที่เปลี่ยนเจ้าของลิงก์ได้',
	USER_NOT_FOUND: 'ไม่พบผู้ใช้',
	ADMIN_CANNOT_SUSPEND_SELF: 'ระงับบัญชีของตัวเองไม่ได้',
	ADMIN_CANNOT_SUSPEND_ADMIN: 'ระงับบัญชีผู้ดูแลระบบไม่ได้',
	RULE_NOT_FOUND: 'ไม่พบกฎนี้',
	RULE_INVALID_PATTERN: 'รูปแบบไม่ถูกต้อง',
	RULE_DUPLICATE: 'มีกฎนี้อยู่แล้ว',
	STATS_INVALID_RANGE: 'ช่วงวันที่ไม่ถูกต้อง',
	STATS_INVALID_TIME_ZONE: 'เขตเวลาไม่ถูกต้อง'
};

const fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่';

/** A Thai message for an Eden error (`res.error`), falling back to a generic one. */
export function errorMessage(err: { status: number; value: unknown } | null | undefined) {
	if (!err) return fallback;
	if (err.status === 422) return 'ข้อมูลไม่ถูกต้อง';
	const code = (err.value as { error?: unknown } | null)?.error;
	return (typeof code === 'string' && messages[code]) || fallback;
}

/** For load functions: the response's data, or a SvelteKit error page. */
export function unwrap<T>(
	res: { data: T; error: null } | { data: null; error: { status: number; value: unknown } }
): T {
	if (res.error) error(res.error.status, errorMessage(res.error));
	return res.data as T;
}
