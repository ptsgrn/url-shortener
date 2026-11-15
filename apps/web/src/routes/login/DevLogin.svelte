<script lang="ts">
	// Dev-only sign-in against /api/dev (see the API's dev module). Those routes
	// are left out of the typed client, so this uses plain fetch.
	import { onMount } from 'svelte';

	type Role = 'user' | 'admin';
	type DevUser = {
		id: string;
		email: string | null;
		name: string | null;
		avatarUrl: string | null;
		role: Role;
	};

	let { redirectTo }: { redirectTo: string } = $props();

	let users = $state<DevUser[] | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(false);
	let name = $state('');
	let email = $state('');
	let role = $state<Role>('user');

	// Only same-origin paths, so `?redirectTo=` can't bounce to another site.
	const target = $derived(
		redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/'
	);

	async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
		busy = true;
		try {
			const res = await fetch(`/api/dev${path}`, init);
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				error = `${res.status} ${body?.error ?? res.statusText}`;
				return null;
			}
			error = null;
			return (await res.json()) as T;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			return null;
		} finally {
			busy = false;
		}
	}

	// Full reload so the server re-resolves the session in hooks.server.ts.
	const done = (user: DevUser | null) => user && location.assign(target);

	const loginAs = async (id: string) =>
		done(await call<DevUser>(`/users/${encodeURIComponent(id)}/login`, { method: 'POST' }));

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const body = { role, ...(name && { name }), ...(email && { email }) };
		done(
			await call<DevUser>('/users', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			})
		);
	}

	onMount(async () => {
		users = await call<DevUser[]>('/users');
	});
</script>

<section aria-labelledby="dev-login">
	<h2 id="dev-login">Dev sign-in</h2>
	<p><small>Local only (<code>DEV_TOOLS=true</code>). Skips Google OAuth.</small></p>

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	<h3>Existing users</h3>
	{#if users === null}
		<p>Loading…</p>
	{:else if users.length === 0}
		<p>No users yet. Create one below.</p>
	{:else}
		<ul>
			{#each users as user (user.id)}
				<li>
					<button type="button" disabled={busy} onclick={() => loginAs(user.id)}>
						{user.name ?? user.email ?? user.id}
					</button>
					{#if user.email && user.name}<small>{user.email}</small>{/if}
					{#if user.role === 'admin'}<strong>admin</strong>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<h3>New user</h3>
	<form onsubmit={create}>
		<input bind:value={name} placeholder="Name (optional)" />
		<input type="email" bind:value={email} placeholder="Email (optional)" />
		<select bind:value={role}>
			<option value="user">user</option>
			<option value="admin">admin</option>
		</select>
		<button type="submit" disabled={busy}>Create and sign in</button>
	</form>
</section>

<style>
	section {
		margin-top: 2rem;
		padding: 1rem;
		border: 2px dashed #d97706;
		border-radius: 0.5rem;
	}
	ul {
		padding-left: 0;
		list-style: none;
	}
	li {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-block: 0.25rem;
	}
</style>
