<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api, type Link } from '#lib/api.ts';
	import LinkList from '#lib/components/LinkList.svelte';
	import LinkQrDialog from '#lib/components/LinkQrDialog.svelte';
	import { errorMessage } from '#lib/errors.ts';
	import { CODE_PATTERN, PAGE_SIZE, displayUrl, shortUrl } from '#lib/links.ts';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let url = $state('');
	let code = $state('');
	let submitting = $state(false);

	let links = $state<Link[]>([]);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	$effect(() => {
		links = data.links;
		hasMore = data.links.length === PAGE_SIZE;
	});

	let created = $state<string | null>(null);
	let createdOpen = $state(false);

	async function shorten(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;
		const res = await api.v1.links.post({ url, ...(code && { code }) });
		submitting = false;
		if (res.error) {
			toast.error(errorMessage(res.error));
			return;
		}
		url = '';
		code = '';
		created = res.data.code;
		createdOpen = true;
		await invalidateAll();
	}

	async function loadMore() {
		loadingMore = true;
		const res = await api.v1.links.get({ query: { offset: links.length, limit: PAGE_SIZE } });
		loadingMore = false;
		if (res.error) {
			toast.error(errorMessage(res.error));
			return;
		}
		links = [...links, ...res.data];
		hasMore = res.data.length === PAGE_SIZE;
	}
</script>

<form onsubmit={shorten} class="flex flex-col">
	<h1 class="text-center text-[40px] leading-tight font-semibold">
		<label for="url">วางลิงค์ URL</label>
	</h1>
	<input
		id="url"
		type="url"
		required
		bind:value={url}
		placeholder="https://example.com/a-very-long-link"
		class="mt-5 h-11 rounded-md border border-input bg-card px-5 text-[15px] placeholder:text-[#979797]"
	/>

	<label for="code" class="mt-5 text-xl">ลิงค์ URL ใหม่</label>
	<div class="mt-2 flex items-center">
		<span class="text-xl">{displayUrl(shortUrl(''))}</span>
		<input
			id="code"
			bind:value={code}
			pattern={CODE_PATTERN}
			title="3–32 ตัวอักษร: A–Z a–z 0–9 - + _"
			placeholder="เว้นว่างเพื่อสุ่มลิงก์อัตโนมัติ"
			class="h-5 min-w-0 flex-1 rounded-sm bg-muted px-2 text-xs placeholder:text-foreground/60"
		/>
	</div>

	<button
		type="submit"
		disabled={submitting}
		class="mt-8 h-17.5 rounded-md bg-primary text-5xl font-semibold hover:bg-primary/80 disabled:opacity-50"
		>สร้างลิงค์</button
	>
</form>

<section class="mt-7 flex flex-col gap-3 px-1.25">
	<h2 class="text-xl font-medium">ลิงก์ที่สร้างล่าสุด</h2>
	<LinkList bind:links empty="ยังไม่มีลิงก์ ลองสร้างลิงก์แรกด้านบน" />
	{#if hasMore}
		<button
			type="button"
			class="self-center text-sm text-brand"
			disabled={loadingMore}
			onclick={loadMore}>ดูเพิ่มเติม</button
		>
	{/if}
</section>

{#if created}
	<LinkQrDialog
		bind:open={createdOpen}
		title="สร้างลิงก์สำเร็จ!"
		url={shortUrl(created)}
		code={created}
	/>
{/if}
