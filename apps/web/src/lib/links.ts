import { page } from '$app/state';
import { toast } from 'svelte-sonner';

// No redirect route or custom short domain yet, so short links live on this origin.
export const shortUrl = (code: string) => `${page.url.origin}/${code}`;

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
