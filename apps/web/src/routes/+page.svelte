<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import { AuthError, InternalError } from 'api/errors';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let url = $state('');
	let result = $state<{ code: string; url: string } | null>(null);
	let error = $state<string | null>(null);

	const shortenErrors: Record<AuthError.Unauthorized | InternalError, string> = {
		[AuthError.Unauthorized]: 'Your session expired. Sign in again.',
		[InternalError.Database]: 'Something went wrong on our side. Try again.',
		[InternalError.Crypto]: 'Something went wrong on our side. Try again.'
	};

	async function shorten(event: SubmitEvent) {
		event.preventDefault();
		const res = await api.v1.links.post({ url });
		if (res.error) {
			result = null;
			error =
				res.error.status === 422 ? 'Enter a valid URL.' : shortenErrors[res.error.value.error];
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
