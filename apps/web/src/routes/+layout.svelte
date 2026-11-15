<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>MicroL</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-110 flex-col">
	<AppHeader user={data.user} />
	<main class="flex flex-1 flex-col px-5 pt-16 pb-4">
		{@render children()}
	</main>
</div>

<Toaster position="top-center" />
