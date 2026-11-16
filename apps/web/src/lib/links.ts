import { page } from '$app/state';
import { toast } from 'svelte-sonner';

export const shortUrl = (code: string) => `${page.url.origin}/${code}`;

/** Links per page in every list (the API's `limit`). */
export const PAGE_SIZE = 20;

/** Short codes as the API accepts them, for an input's `pattern` (`v`-flag syntax). */
export const CODE_PATTERN = String.raw`[A-Za-z0-9+_\-]{3,32}`;

export const displayUrl = (url: string) => url.replace(/^https?:\/\//, '');

export async function copy(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast.success('คัดลอกแล้ว');
	} catch {
		toast.error('คัดลอกไม่สำเร็จ');
	}
}

const rtf = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });
const units: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 3600],
	['month', 30 * 24 * 3600],
	['day', 24 * 3600],
	['hour', 3600],
	['minute', 60],
	['second', 1]
];

export function timeAgo(date: Date, now = new Date()) {
	const seconds = (date.getTime() - now.getTime()) / 1000;
	const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) ?? units.at(-1)!;
	return rtf.format(Math.round(seconds / size), unit);
}
