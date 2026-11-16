<script lang="ts">
	import clipboard from '#lib/assets/clipboard.svg';
	import type { AdminLink, Link } from '#lib/api.ts';
	import { copy, displayUrl, shortUrl, timeAgo } from '#lib/links.ts';

	let {
		link,
		admin = false,
		onedit,
		ontoggle,
		ondelete,
		onstats,
		onqr,
		onban,
		onowner
	}: {
		link: Link | AdminLink;
		/** Admin view: shows the owner and ban actions, hides delete (owners only). */
		admin?: boolean;
		onedit: () => void;
		ontoggle: () => void;
		ondelete: () => void;
		onstats: () => void;
		onqr: () => void;
		onban?: () => void;
		onowner?: () => void;
	} = $props();

	const short = $derived(shortUrl(link.code));
	const owner = $derived('owner' in link ? link.owner : null);
	// Deleted links (admin list, `deleted=1`) can only be looked at.
	const deleted = $derived('deletedAt' in link && link.deletedAt !== null);

	const statusText = $derived(
		deleted
			? 'ลบแล้ว'
			: {
					active: null,
					disabled: 'ปิดใช้งาน',
					banned: `ถูกระงับ${link.bannedReason ? `: ${link.bannedReason}` : ''}`,
					blocked: 'โดเมนไม่ได้รับอนุญาต'
				}[link.status]
	);
</script>

<article class="flex flex-col gap-1 rounded-md bg-muted px-3.25 pt-2 pb-2.5 text-[11px]">
	<div class="flex items-center gap-6">
		<span class:line-through={deleted || link.status !== 'active'}>{displayUrl(short)}</span>
		<button type="button" aria-label="คัดลอกลิงก์" onclick={() => copy(short)}>
			<img src={clipboard} alt="" width="12.25" height="12.25" />
		</button>
		{#if statusText}
			<span class="ml-auto rounded-sm bg-foreground/10 px-1.5 text-[10px]">{statusText}</span>
		{/if}
	</div>
	<p class="truncate">{link.url}</p>
	{#if admin && owner}
		<p class="truncate text-muted-foreground">โดย {owner.name ?? owner.email ?? 'ไม่ทราบ'}</p>
	{/if}
	<div class="flex flex-wrap items-center gap-x-4.5 gap-y-1 pt-3 text-xs text-brand">
		{#if !deleted}
			<button type="button" onclick={onedit}>แก้ไข</button>
			{#if link.status !== 'banned'}
				<button type="button" onclick={ontoggle}>
					{link.deactivatedAt ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
				</button>
			{/if}
			{#if !admin}
				<button type="button" onclick={ondelete}>ลบ</button>
			{/if}
		{/if}
		<button type="button" onclick={onstats}>สถิติการเข้าชม</button>
		{#if !deleted}
			<button type="button" onclick={onqr}>qrcode</button>
			{#if admin && onban}
				<button type="button" onclick={onban}>{link.bannedAt ? 'ยกเลิกระงับ' : 'ระงับ'}</button>
			{/if}
			{#if admin && onowner}
				<button type="button" onclick={onowner}>เปลี่ยนเจ้าของ</button>
			{/if}
		{/if}
		<span>{timeAgo(new Date(link.createdAt))}</span>
	</div>
</article>
