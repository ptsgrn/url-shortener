<script lang="ts">
	import { resolve } from '$app/paths';
	import logo from '#lib/assets/logo.svg';
	import { logout } from '#lib/auth.ts';
	import * as Sheet from '#lib/components/ui/sheet/index.js';

	let { user }: { user: App.Locals['user'] } = $props();

	let open = $state(false);

	const item = 'rounded-md px-2 py-2 text-left hover:bg-muted';
</script>

<header class="flex h-22.5 items-center gap-1 rounded-md bg-secondary pr-5 pl-11">
	<a href={resolve('/')} class="flex items-center gap-1" aria-label="MicroL home">
		<img src={logo} alt="" width="96" height="63" />
		<span class="font-mono text-[40px] leading-none font-bold"
			>Micro<span class="text-brand">L</span></span
		>
	</a>

	<div class="flex-1"></div>

	<Sheet.Root bind:open>
		<Sheet.Trigger class="flex h-6.25 w-10 flex-col justify-between" aria-label="Menu">
			<span class="h-1.25 w-10 bg-foreground"></span>
			<span class="h-1.25 w-10 bg-foreground"></span>
			<span class="h-1.25 w-10 bg-foreground"></span>
		</Sheet.Trigger>
		<Sheet.Content side="right" class="w-64">
			<Sheet.Header>
				<Sheet.Title>{user ? (user.name ?? user.email) : 'MicroL'}</Sheet.Title>
				{#if user?.name && user.email}
					<Sheet.Description>{user.email}</Sheet.Description>
				{/if}
			</Sheet.Header>
			<nav class="flex flex-col gap-1 px-4 text-lg">
				{#if user}
					<a href={resolve('/')} class={item} onclick={() => (open = false)}>สร้างลิงก์</a>
					{#if user.role === 'admin'}
						<a href={resolve('/admin')} class={item} onclick={() => (open = false)}>ผู้ดูแลระบบ</a>
					{/if}
				{:else}
					<a href={resolve('/login')} class={item} onclick={() => (open = false)}>เข้าสู่ระบบ</a>
				{/if}
				<a href={resolve('/contact')} class={item} onclick={() => (open = false)}>ติดต่อเรา</a>
				{#if user}
					<button
						type="button"
						class="{item} text-brand"
						onclick={() => {
							open = false;
							logout();
						}}>ออกจากระบบ</button
					>
				{/if}
			</nav>
		</Sheet.Content>
	</Sheet.Root>
</header>
