<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { api, type AuditEntry } from '#lib/api.ts';
	import { Button } from '#lib/components/ui/button/index.js';
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

	const targetTypes = { user: 'บัญชี', link: 'ลิงก์', rule: 'กฎโดเมน' } as const;

	const actorName = (entry: AuditEntry) => {
		const actor = entry.actor as { name?: string | null; email?: string | null } | null;
		return actor?.name ?? actor?.email ?? 'ไม่ทราบ';
	};

	/** The current URL without one search param, for clearing a filter chip. */
	function without(name: string) {
		const url = new URL(page.url.href);
		url.searchParams.delete(name);
		return `${url.pathname}${url.search}`;
	}

	/** What the API recorded about the target; links carry `code`, rules `pattern`. */
	type Details = { code?: string; pattern?: string; name?: string | null; email?: string | null };
	const details = (entry: AuditEntry) => (entry.details ?? {}) as Details;

	const dateTime = new Intl.DateTimeFormat('th', { dateStyle: 'medium', timeStyle: 'short' });

	async function loadMore() {
		loadingMore = true;
		const res = await api.v1.admin.audit.get({
			query: {
				action: data.filters.action ?? undefined,
				targetType: data.filters.targetType ?? undefined,
				actorId: data.filters.actorId ?? undefined,
				targetId: data.filters.targetId ?? undefined,
				offset: entries.length,
				limit: PAGE_SIZE
			}
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

<form method="GET" class="mt-4 flex flex-wrap gap-2 pr-9 pl-3">
	{#if data.filters.actorId}<input type="hidden" name="actor" value={data.filters.actorId} />{/if}
	{#if data.filters.targetId}<input
			type="hidden"
			name="target"
			value={data.filters.targetId}
		/>{/if}
	<select
		name="action"
		value={data.filters.action ?? ''}
		aria-label="การดำเนินการ"
		class="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm"
	>
		<option value="">ทุกการดำเนินการ</option>
		{#each Object.entries(actions) as [value, label] (value)}
			<option {value}>{label}</option>
		{/each}
	</select>
	<select
		name="type"
		value={data.filters.targetType ?? ''}
		aria-label="ประเภท"
		class="h-8 rounded-md border border-input bg-card px-2 text-sm"
	>
		<option value="">ทุกประเภท</option>
		{#each Object.entries(targetTypes) as [value, label] (value)}
			<option {value}>{label}</option>
		{/each}
	</select>
	<Button type="submit" size="sm">กรอง</Button>
</form>

{#if data.filters.actorId || data.filters.targetId}
	<div class="mt-2 flex flex-wrap gap-2 pr-9 pl-3 text-sm">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- same page, fewer params -->
		{#if data.filters.actorId}
			<a href={without('actor')} class="rounded-md bg-muted px-2">
				โดย {data.actorName ?? 'ผู้ดูแลที่เลือก'} ✕
			</a>
		{/if}
		{#if data.filters.targetId}
			<a href={without('target')} class="rounded-md bg-muted px-2">
				กับ {data.targetName ?? 'รายการที่เลือก'} ✕
			</a>
		{/if}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
{/if}

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
					<a href={resolve('/admin/users/[id]', { id: entry.targetId })} class="text-brand">
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
