<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api } from '#lib/api.ts';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { errorMessage } from '#lib/errors.ts';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const account = $derived(data.account);
	const suspended = $derived(account.status === 'suspended');
	let confirmOpen = $state(false);

	const dateTime = new Intl.DateTimeFormat('th', { dateStyle: 'long', timeStyle: 'short' });

	const counts = $derived([
		{ label: 'ลิงก์ทั้งหมด', n: account.links.total },
		{ label: 'ปิดใช้งาน', n: account.links.disabled },
		{ label: 'ถูกระงับ', n: account.links.banned },
		{ label: 'ลบแล้ว', n: account.links.deleted }
	]);

	async function setSuspended(reason: string) {
		const suspension = api.v1.admin.users({ id: account.id }).suspension;
		const res = suspended ? await suspension.delete() : await suspension.post({ reason });
		if (res.error) {
			toast.error(errorMessage(res.error));
			return false;
		}
		toast.success(suspended ? 'ยกเลิกการระงับแล้ว' : 'ระงับบัญชีแล้ว');
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{account.name ?? account.email ?? 'บัญชีผู้ใช้'} · MicroL</title>
</svelte:head>

<a href={resolve('/admin/users')} class="-mt-8 pl-4 text-sm text-brand">← บัญชีผู้ใช้</a>

<div class="mt-2 flex items-center gap-3 pl-4">
	{#if account.avatarUrl}
		<img src={account.avatarUrl} alt="" width="48" height="48" class="rounded-full" />
	{/if}
	<div class="min-w-0">
		<h1 class="truncate text-[28px] leading-tight font-medium">{account.name ?? 'ไม่มีชื่อ'}</h1>
		<p class="truncate text-sm text-muted-foreground">{account.email ?? '—'}</p>
	</div>
</div>

<dl class="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 text-sm">
	<dt class="text-muted-foreground">บทบาท</dt>
	<dd>{account.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้'}</dd>
	<dt class="text-muted-foreground">สถานะ</dt>
	<dd>
		{#if suspended}
			ถูกระงับ{account.suspendedAt
				? ` เมื่อ ${dateTime.format(new Date(account.suspendedAt))}`
				: ''}
		{:else}
			ใช้งานอยู่
		{/if}
	</dd>
	{#if suspended && account.suspendedReason}
		<dt class="text-muted-foreground">เหตุผล</dt>
		<dd>{account.suspendedReason}</dd>
	{/if}
	<dt class="text-muted-foreground">สมัครเมื่อ</dt>
	<dd>{dateTime.format(new Date(account.createdAt))}</dd>
</dl>

<div class="mt-5 grid grid-cols-2 gap-3 px-3">
	{#each counts as c (c.label)}
		<div class="rounded-md bg-muted px-3 py-2">
			<p class="text-xs">{c.label}</p>
			<p class="text-2xl tabular-nums">{c.n.toLocaleString('th')}</p>
		</div>
	{/each}
</div>

<nav class="mt-5 flex flex-col gap-2 px-3 text-sm text-brand">
	<a href={resolve(`/admin/links?owner=${account.id}`)}>ดูลิงก์ที่ผู้ใช้สร้าง</a>
	{#if account.links.deleted}
		<a href={resolve(`/admin/links?owner=${account.id}&deleted=1`)}>ดูลิงก์ที่ลบแล้ว</a>
	{/if}
	<a href={resolve(`/admin/audit?target=${account.id}`)}>ประวัติการดำเนินการกับบัญชีนี้</a>
	{#if account.role === 'admin'}
		<a href={resolve(`/admin/audit?actor=${account.id}`)}>ประวัติการดำเนินการของผู้ดูแลคนนี้</a>
	{/if}
</nav>

{#if account.role !== 'admin'}
	<Button size="lg" class="mx-3 mt-6" onclick={() => (confirmOpen = true)}>
		{suspended ? 'ยกเลิกแบน' : 'แบนบัญชีนี้'}
	</Button>
{/if}

<ConfirmDialog
	bind:open={confirmOpen}
	title={suspended ? 'ยกเลิกการระงับบัญชี?' : 'ระงับบัญชีนี้?'}
	description={suspended
		? 'บัญชีจะกลับมาใช้งานได้ แต่ต้องเข้าสู่ระบบใหม่'
		: 'บัญชีจะออกจากระบบทันที จัดการลิงก์ไม่ได้ และลิงก์ทั้งหมดจะหยุดทำงาน'}
	confirmLabel={suspended ? 'ยกเลิกแบน' : 'แบน'}
	reason={!suspended}
	onconfirm={setSuspended}
/>
