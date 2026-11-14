<script lang="ts">
	import { api } from '#lib/api.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let url = $state('');
	let result = $state<{ code: string; url: string } | null>(null);
	let error = $state<string | null>(null);

	async function shorten(event: SubmitEvent) {
		event.preventDefault();
		const res = await api.links.post({ url });
		if (res.error) {
			result = null;
			error = `Request failed (${res.error.status})`;
			return;
		}
		error = null;
		result = res.data;
	}
</script>

<h1>URL shortener</h1>
<p>API status: {data.health?.status ?? 'unreachable'}</p>

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
