<script lang="ts">
	import { resolve } from '$app/paths';
	import { api, type AdminUser } from '#lib/api.ts';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage } from '#lib/errors.ts';
	import { PAGE_SIZE } from '#lib/links.ts';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let users = $state<AdminUser[]>([]);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	$effect(() => {
		users = data.users;
		hasMore = data.users.length === PAGE_SIZE;
	});

	let target = $state<AdminUser | null>(null);
	let confirmOpen = $state(false);

	function ask(user: AdminUser) {
		target = user;
		confirmOpen = true;
	}

	async function setSuspended(reason: string) {
		const suspension = api.v1.admin.users({ id: target!.id }).suspension;
		const res =
			target!.status === 'suspended'
				? await suspension.delete()
				: await suspension.post({ reason });
		if (res.error) {
			toast.error(errorMessage(res.error));
			return false;
		}
		const updated = res.data;
		users = users.map((u) => (u.id === updated.id ? { ...u, ...updated } : u));
		toast.success(updated.status === 'suspended' ? 'ระงับบัญชีแล้ว' : 'ยกเลิกการระงับแล้ว');
	}

	async function loadMore() {
		loadingMore = true;
		const { q, status } = data.filters;
		const res = await api.v1.admin.users.get({
			query: {
				q: q || undefined,
				status: status ?? undefined,
				offset: users.length,
				limit: PAGE_SIZE
			}
		});
		loadingMore = false;
		if (res.error) {
			toast.error(errorMessage(res.error));
			return;
		}
		users = [...users, ...res.data];
		hasMore = res.data.length === PAGE_SIZE;
	}
</script>

<svelte:head>
	<title>บัญชีผู้ใช้ · MicroL</title>
</svelte:head>

<h1 class="pl-4 text-[32px] leading-tight font-medium">บัญชีผู้ใช้</h1>

<form method="GET" class="mt-4 flex flex-wrap gap-2 pr-9 pl-3" data-sveltekit-keepfocus>
	<input
		name="q"
		value={data.filters.q}
		placeholder="ค้นหาจากชื่อหรืออีเมล"
		class="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm"
	/>
	<select
		name="status"
		value={data.filters.status ?? ''}
		class="h-8 rounded-md border border-input bg-card px-2 text-sm"
	>
		<option value="">ทุกสถานะ</option>
		<option value="active">ใช้งานอยู่</option>
		<option value="suspended">ถูกระงับ</option>
	</select>
	<Button type="submit" size="sm">ค้นหา</Button>
</form>

<div class="mt-5 flex flex-col gap-5 pr-9 pl-3">
	{#each users as user (user.id)}
		<article class="flex flex-col gap-1 rounded-md bg-muted px-4 pt-3 pb-3 text-sm">
			<div class="flex items-center gap-2">
				<p class="truncate">{user.name ?? 'ไม่มีชื่อ'}</p>
				{#if user.role === 'admin'}
					<span class="rounded-sm bg-primary px-1.5 text-[10px]">ผู้ดูแล</span>
				{/if}
				{#if user.status === 'suspended'}
					<span class="rounded-sm bg-foreground/10 px-1.5 text-[10px]">ถูกระงับ</span>
				{/if}
			</div>
			<p class="truncate">{user.email ?? '—'}</p>
			{#if user.status === 'suspended' && user.suspendedReason}
				<p class="text-xs text-muted-foreground">เหตุผล: {user.suspendedReason}</p>
			{/if}
			<div class="flex flex-wrap gap-3 pt-2 text-brand">
				{#if user.role !== 'admin'}
					<button type="button" onclick={() => ask(user)}>
						{user.status === 'suspended' ? 'ยกเลิกแบน' : 'แบน'}
					</button>
				{/if}
				<a href={resolve(`/admin/links?owner=${user.id}`)}>
					ดูลิงก์ที่ผู้ใช้สร้าง ({user.linkCount})
				</a>
			</div>
		</article>
	{:else}
		<p class="py-8 text-center text-muted-foreground">ไม่พบผู้ใช้</p>
	{/each}
	{#if hasMore}
		<button
			type="button"
			class="self-center text-sm text-brand"
			disabled={loadingMore}
			onclick={loadMore}>ดูเพิ่มเติม</button
		>
	{/if}
</div>

{#if target}
	{@const suspended = target.status === 'suspended'}
	<ConfirmDialog
		bind:open={confirmOpen}
		title={suspended ? 'ยกเลิกการระงับบัญชี?' : 'ระงับบัญชีนี้?'}
		description={suspended
			? `${target.name ?? target.email} จะกลับมาใช้งานได้ แต่ต้องเข้าสู่ระบบใหม่`
			: `${target.name ?? target.email} จะออกจากระบบทันที จัดการลิงก์ไม่ได้ และลิงก์ทั้งหมดจะหยุดทำงาน`}
		confirmLabel={suspended ? 'ยกเลิกแบน' : 'แบน'}
		reason={!suspended}
		onconfirm={setSuspended}
	/>
{/if}
