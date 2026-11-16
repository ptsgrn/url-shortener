<script lang="ts">
	import { resolve } from '$app/paths';
	import { api, type AuditEntry } from '#lib/api.ts';
	import { errorMessage } from '#lib/errors.ts';
	import { PAGE_SIZE, timeAgo } from '#lib/links.ts';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let entries = $state<AuditEntry[]>([]);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	$effect(() => {
		entries = data.entries;
		hasMore = data.entries.length === PAGE_SIZE;
	});

	const actions: Record<AuditEntry['action'], string> = {
		'user.suspend': 'ระงับบัญชี',
		'user.restore': 'ยกเลิกระงับบัญชี',
		'link.update': 'แก้ไขลิงก์',
		'link.ban': 'ระงับลิงก์',
		'link.unban': 'ยกเลิกระงับลิงก์',
		'rule.create': 'เพิ่มกฎ',
		'rule.update': 'แก้ไขกฎ',
		'rule.delete': 'ลบกฎ'
	};

	const actorName = (entry: AuditEntry) => {
		const actor = entry.actor as { name?: string | null; email?: string | null } | null;
		return actor?.name ?? actor?.email ?? 'ไม่ทราบ';
	};

	/** What the API recorded about the target; links carry `code`, rules `pattern`. */
	type Details = { code?: string; pattern?: string; name?: string | null; email?: string | null };
	const details = (entry: AuditEntry) => (entry.details ?? {}) as Details;

	const dateTime = new Intl.DateTimeFormat('th', { dateStyle: 'medium', timeStyle: 'short' });

	async function loadMore() {
		loadingMore = true;
		const res = await api.v1.admin.audit.get({
			query: { offset: entries.length, limit: PAGE_SIZE }
		});
		loadingMore = false;
		if (res.error) {
			toast.error(errorMessage(res.error));
			return;
		}
		entries = [...entries, ...res.data];
		hasMore = res.data.length === PAGE_SIZE;
	}
</script>

<svelte:head>
	<title>ประวัติการดำเนินการ · MicroL</title>
</svelte:head>

<h1 class="pl-4 text-[32px] leading-tight font-medium">ประวัติการดำเนินการ</h1>

<ol class="mt-5 flex flex-col gap-3 pr-9 pl-3">
	{#each entries as entry (entry.id)}
		{@const at = new Date(entry.createdAt)}
		<li class="flex flex-col gap-0.5 rounded-md bg-muted px-4 py-2.5 text-sm">
			<div class="flex items-baseline justify-between gap-2">
				<span class="font-medium">{actions[entry.action]}</span>
				<time datetime={at.toISOString()} title={dateTime.format(at)} class="text-xs">
					{timeAgo(at)}
				</time>
			</div>
			<p class="truncate text-xs">
				โดย {actorName(entry)} ·
				{#if entry.targetType === 'link'}
					{@const code = details(entry).code}
					{#if code}
						<a href={resolve(`/admin/links?q=${encodeURIComponent(code)}`)} class="text-brand"
							>/{code}</a
						>
					{:else}
						ลิงก์
					{/if}
				{:else if entry.targetType === 'user'}
					<a href={resolve(`/admin/links?owner=${entry.targetId}`)} class="text-brand">
						{details(entry).name ?? details(entry).email ?? 'ผู้ใช้'}
					</a>
				{:else}
					กฎ {details(entry).pattern ?? ''}
				{/if}
			</p>
			{#if entry.reason}<p class="text-xs text-muted-foreground">เหตุผล: {entry.reason}</p>{/if}
		</li>
	{:else}
		<p class="py-8 text-center text-muted-foreground">ยังไม่มีประวัติ</p>
	{/each}
</ol>
{#if hasMore}
	<button
		type="button"
		class="mt-3 self-center text-sm text-brand"
		disabled={loadingMore}
		onclick={loadMore}>ดูเพิ่มเติม</button
	>
{/if}
