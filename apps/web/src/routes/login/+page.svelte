<script lang="ts">
	import { dev } from '$app/env';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/');
</script>

<h1>Sign in</h1>
<!-- A full-page navigation to the API's OAuth redirect, not a SvelteKit route. -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a href={`/api/v1/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`} data-sveltekit-reload
	>Sign in with Google</a
>

{#if dev && data.devTools}
	{#await import('./DevLogin.svelte') then { default: DevLogin }}
		<DevLogin {redirectTo} />
	{/await}
{/if}
