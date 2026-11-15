<script lang="ts">
	import clipboard from '#lib/assets/clipboard.svg';
	import { copy, displayUrl, shortUrl, timeAgo } from '#lib/links.ts';

	let {
		code,
		url,
		createdAt,
		onqr
	}: { code: string; url: string; createdAt: Date; onqr: () => void } = $props();

	const short = $derived(shortUrl(code));
	// Edit, deactivate, delete and stats need API endpoints that don't exist yet.
	const pending = ['แก้ไข', 'ปิดใช้งาน', 'ลบ', 'สถิติการเข้าชม'];
</script>

<article class="flex flex-col gap-1 rounded-md bg-muted px-3.25 pt-2 pb-2.5 text-[11px]">
	<div class="flex items-center gap-6">
		<span>{displayUrl(short)}</span>
		<button type="button" aria-label="คัดลอกลิงก์" onclick={() => copy(short)}>
			<img src={clipboard} alt="" width="12.25" height="12.25" />
		</button>
	</div>
	<p class="truncate">{url}</p>
	<div class="flex flex-wrap items-center gap-x-4.5 pt-3 text-xs text-brand">
		{#each pending as label (label)}
			<button type="button" disabled title="ยังไม่พร้อมใช้งาน" class="disabled:opacity-50"
				>{label}</button
			>
		{/each}
		<button type="button" onclick={onqr}>qrcode</button>
		<span>{timeAgo(createdAt)}</span>
	</div>
</article>
