<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import logo from '#lib/assets/logo.svg';
	import { api } from '#lib/api.ts';
	import * as Sheet from '#lib/components/ui/sheet/index.js';

	let { user }: { user: App.Locals['user'] } = $props();

	let open = $state(false);

	async function logout() {
		open = false;
		await api.v1.auth.logout.post();
		await invalidateAll();
		await goto(resolve('/login'));
	}
</script>

<header class="flex h-22.5 items-center gap-1 rounded-md bg-secondary pr-5 pl-11">
	<a href={resolve('/')} class="flex items-center gap-1" aria-label="MicroL home">
		<img src={logo} alt="" width="96" height="63" />
		<span class="font-mono text-[40px] leading-none font-bold"
			>Micro<span class="text-brand">L</span></span
		>
	</a>

	<div class="flex-1"></div>

	{#if user}
		<Sheet.Root bind:open>
			<Sheet.Trigger class="flex h-6.25 w-10 flex-col justify-between" aria-label="Menu">
				<span class="h-1.25 w-10 bg-foreground"></span>
				<span class="h-1.25 w-10 bg-foreground"></span>
				<span class="h-1.25 w-10 bg-foreground"></span>
			</Sheet.Trigger>
			<Sheet.Content side="right" class="w-64">
				<Sheet.Header>
					<Sheet.Title>{user.name ?? user.email}</Sheet.Title>
					{#if user.name && user.email}
						<Sheet.Description>{user.email}</Sheet.Description>
					{/if}
				</Sheet.Header>
				<nav class="flex flex-col gap-1 px-4 text-lg">
					<a
						href={resolve('/')}
						class="rounded-md px-2 py-2 hover:bg-muted"
						onclick={() => (open = false)}>สร้างลิงก์</a
					>
					<button
						type="button"
						class="rounded-md px-2 py-2 text-left text-brand hover:bg-muted"
						onclick={logout}>ออกจากระบบ</button
					>
				</nav>
			</Sheet.Content>
		</Sheet.Root>
	{/if}
</header>
