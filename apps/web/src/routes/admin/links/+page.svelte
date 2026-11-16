<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import filter from '#lib/assets/filter.png';
	import { api, type AdminLink } from '#lib/api.ts';
	import LinkList from '#lib/components/LinkList.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage } from '#lib/errors.ts';
	import { PAGE_SIZE } from '#lib/links.ts';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let showFilter = $state(false);
	let links = $state<AdminLink[]>([]);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	$effect(() => {
		links = data.links;
		hasMore = data.links.length === PAGE_SIZE;
		if (data.filters.q || data.filters.status) showFilter = true;
	});

	const statuses = [
		['', 'ทุกสถานะ'],
		['active', 'ใช้งานอยู่'],
		['disabled', 'ปิดใช้งาน'],
		['banned', 'ถูกระงับ'],
		['blocked', 'โดเมนไม่ได้รับอนุญาต']
	] as const;

	/** The current URL without one search param, for clearing a filter. */
	function without(name: string) {
		const url = new URL(page.url.href);
		url.searchParams.delete(name);
		return `${url.pathname}${url.search}`;
	}

	async function loadMore() {
		loadingMore = true;
		const { q, status, ownerId } = data.filters;
		const res = await api.v1.admin.links.get({
			query: {
				q: q || undefined,
				status: status ?? undefined,
				ownerId,
				offset: links.length,
				limit: PAGE_SIZE
			}
		});
		loadingMore = false;
		if (res.error) {
			toast.error(errorMessage(res.error));
			return;
		}
		links = [...links, ...res.data];
		hasMore = res.data.length === PAGE_SIZE;
	}
</script>

<svelte:head>
	<title>รายการลิงก์ทั้งหมด · MicroL</title>
</svelte:head>

<div class="-mt-4 flex items-center justify-between pl-4">
	<h1 class="text-[30px] leading-tight font-medium">รายการลิงก์ทั้งหมด</h1>
	<Button href={resolve('/')} class="h-7.75 w-28.75 text-xl font-medium">สร้าง</Button>
</div>

<div class="mt-2 flex items-center gap-2 pl-4">
	<button
		type="button"
		aria-label="กรองลิงก์"
		aria-expanded={showFilter}
		onclick={() => (showFilter = !showFilter)}
	>
		<img src={filter} alt="" width="20" height="20" />
	</button>
	{#if data.owner}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, fewer params -->
		<a href={without('owner')} class="rounded-md bg-muted px-2 text-sm">
			ของ {data.owner.name ?? data.owner.email} ✕
		</a>
	{/if}
</div>

{#if showFilter}
	<form method="GET" class="mx-3.5 mt-2 flex flex-wrap gap-2" data-sveltekit-keepfocus>
		{#if data.filters.ownerId}<input type="hidden" name="owner" value={data.filters.ownerId} />{/if}
		<input
			name="q"
			value={data.filters.q}
			placeholder="ค้นหาจากโค้ดหรือ URL"
			class="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm"
		/>
		<select
			name="status"
			value={data.filters.status ?? ''}
			class="h-8 rounded-md border border-input bg-card px-2 text-sm"
		>
			{#each statuses as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
		<Button type="submit" size="sm">ค้นหา</Button>
	</form>
{/if}

<div class="mt-3 flex flex-col gap-3 px-3.5">
	<LinkList bind:links admin empty="ไม่พบลิงก์" />
	{#if hasMore}
		<button
			type="button"
			class="self-center text-sm text-brand"
			disabled={loadingMore}
			onclick={loadMore}>ดูเพิ่มเติม</button
		>
	{/if}
</div>
