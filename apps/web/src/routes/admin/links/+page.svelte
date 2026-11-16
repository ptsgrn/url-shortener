<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import filter from '#lib/assets/filter.png';
	import LinkCard from '#lib/components/LinkCard.svelte';
	import LinkQrDialog from '#lib/components/LinkQrDialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { shortUrl } from '#lib/links.ts';
	import { links, users } from '../sample.ts';

	const userId = $derived(page.url.searchParams.get('user'));
	const owner = $derived(users.find((u) => u.id === userId));

	let showFilter = $state(false);
	let query = $state('');
	let qr = $state<string | null>(null);
	let qrOpen = $state(false);

	const shown = $derived(
		links.filter(
			(l) =>
				(!userId || l.userId === userId) &&
				(!query || `${l.code} ${l.url}`.toLowerCase().includes(query.toLowerCase()))
		)
	);
</script>

<svelte:head>
	<title>รายการลิงก์ทั้งหมด · MicroL</title>
</svelte:head>

<div class="-mt-4 flex items-center justify-between pl-4">
	<h1 class="text-[30px] leading-tight font-medium">รายการลิงก์ทั้งหมด</h1>
	<Button href={resolve('/')} class="h-7.75 w-28.75 text-xl font-medium">สร้าง</Button>
</div>

<div class="mt-2 flex items-center gap-2 pl-4">
	<button type="button" aria-label="กรองลิงก์" onclick={() => (showFilter = !showFilter)}>
		<img src={filter} alt="" width="20" height="20" />
	</button>
	{#if owner}
		<a href={resolve('/admin/links')} class="rounded-md bg-muted px-2 text-sm">{owner.name} ✕</a>
	{/if}
</div>
{#if showFilter}
	<!-- svelte-ignore a11y_autofocus -->
	<input
		bind:value={query}
		autofocus
		placeholder="ค้นหาจากโค้ดหรือ URL"
		class="mx-3.5 mt-2 h-8 rounded-md border border-input bg-card px-3 text-sm"
	/>
{/if}

<div class="mt-2 flex flex-col gap-2 px-3.5">
	{#each shown as link (link.code)}
		<LinkCard
			{...link}
			onqr={() => {
				qr = link.code;
				qrOpen = true;
			}}
		/>
	{:else}
		<p class="py-8 text-center text-muted-foreground">ไม่พบลิงก์</p>
	{/each}
</div>

{#if qr}
	<LinkQrDialog bind:open={qrOpen} title="QR Code" url={shortUrl(qr)} code={qr} />
{/if}
