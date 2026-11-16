<script lang="ts">
	// /api/dev is left out of the typed client, so plain fetch.
	import { onMount } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

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

<section
	aria-labelledby="dev-login"
	class="mt-8 rounded-md border-2 border-dashed border-amber-600 p-4 text-sm"
>
	<h2 id="dev-login" class="text-lg font-semibold">Dev sign-in</h2>
	<p class="text-muted-foreground">
		Local only (<code>DEV_TOOLS=true</code>). Skips Google OAuth.
	</p>

	{#if error}
		<p role="alert" class="mt-2 text-destructive">{error}</p>
	{/if}

	<h3 class="mt-4 font-medium">Existing users</h3>
	{#if users === null}
		<p>Loading…</p>
	{:else if users.length === 0}
		<p>No users yet. Create one below.</p>
	{:else}
		<ul class="mt-1 flex flex-col gap-1">
			{#each users as user (user.id)}
				<li class="flex items-center gap-2">
					<Button size="sm" disabled={busy} onclick={() => loginAs(user.id)}>
						{user.name ?? user.email ?? user.id}
					</Button>
					{#if user.email && user.name}<small class="truncate">{user.email}</small>{/if}
					{#if user.role === 'admin'}<strong class="text-brand">admin</strong>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<h3 class="mt-4 font-medium">New user</h3>
	<form onsubmit={create} class="mt-1 flex flex-col gap-2">
		<Input bind:value={name} placeholder="Name (optional)" />
		<Input type="email" bind:value={email} placeholder="Email (optional)" />
		<select bind:value={role} class="h-8 rounded-lg border border-input bg-card px-2">
			<option value="user">user</option>
			<option value="admin">admin</option>
		</select>
		<Button type="submit" disabled={busy}>Create and sign in</Button>
	</form>
</section>
