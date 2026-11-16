<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import notFound from '#lib/assets/not-found.png';
	import serverError from '#lib/assets/server-error.png';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<svelte:head>
	<title>{page.status} · MicroL</title>
</svelte:head>

{#if page.status < 500}
	<img src={notFound} alt="" width="223" height="223" class="mx-auto -scale-x-100" />
	<h1 class="mt-5 text-center text-4xl leading-tight font-medium">
		{page.status}<br />Oops...<br />
		{page.status === 404 ? 'Page not found' : 'Something went wrong'}
	</h1>
	<!-- SvelteKit's own messages ("Not Found") are English; ours are the Thai ones. -->
	{#if page.error?.message && !/^[A-Za-z ]+$/.test(page.error.message)}
		<p class="mt-4 text-center text-lg">{page.error.message}</p>
	{/if}
{:else}
	<!-- The artwork is cropped from a larger illustration that has "502 Bad Gateway" baked in. -->
	<div class="relative -mt-4 h-75 overflow-hidden">
		<img
			src={serverError}
			alt="502 Bad Gateway"
			width="763"
			height="572"
			class="absolute top-[-115px] left-[calc(50%-373px)] h-143 w-auto max-w-none"
		/>
	</div>
	<p class="mt-4 text-center text-[11px]">
		Looks like the server is experiencing an error while processing your request.<br />
		Please try again in a few minutes.
	</p>
{/if}

<Button href={resolve('/')} size="xl" class="mt-8">กลับหน้าหลัก</Button>
