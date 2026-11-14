<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let url = $state('');
	let result = $state<{ code: string; url: string } | null>(null);
	let error = $state<string | null>(null);

	async function shorten(event: SubmitEvent) {
		event.preventDefault();
		const res = await api.v1.links.post({ url });
		if (res.error) {
			result = null;
			error = `Request failed (${res.error.status})`;
			return;
		}
		error = null;
		result = res.data;
	}

	async function logout() {
		await api.v1.auth.logout.post();
		result = null;
		await invalidateAll();
	}
</script>

<h1>URL shortener</h1>
<p>API status: {data.health?.status ?? 'unreachable'}</p>

{#if data.user}
	<p>
		Signed in as {data.user.name ?? data.user.email}
		<button type="button" onclick={logout}>Sign out</button>
	</p>

	<form onsubmit={shorten}>
		<input type="url" bind:value={url} required placeholder="https://example.com" />
		<button type="submit">Shorten</button>
	</form>

	{#if result}
		<p>Short code: <code>{result.code}</code> → {result.url}</p>
	{/if}
	{#if error}
		<p role="alert">{error}</p>
	{/if}
{:else}
	<p><a href={resolve('/login')}>Sign in</a> to shorten links.</p>
{/if}
