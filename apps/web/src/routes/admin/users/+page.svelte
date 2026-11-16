<script lang="ts">
	import { resolve } from '$app/paths';
	import { users } from '../sample.ts';
</script>

<svelte:head>
	<title>บัญชีผู้ใช้ · MicroL</title>
</svelte:head>

<h1 class="pl-4 text-[32px] leading-tight font-medium">บัญชีผู้ใช้</h1>

<div class="mt-5 flex flex-col gap-5 pr-9 pl-3">
	{#each users as user (user.id)}
		<article class="flex flex-col gap-1 rounded-md bg-muted px-4 pt-3 pb-3 text-sm">
			<p>{user.name}</p>
			<p>{user.email}</p>
			<div class="flex gap-3 pt-2 text-brand">
				<button type="button" disabled title="ยังไม่พร้อมใช้งาน" class="disabled:opacity-50"
					>แบน</button
				>
				<a href={resolve(`/admin/links?user=${user.id}`)}>ดูลิงก์ที่ผู้ใช้สร้าง</a>
			</div>
		</article>
	{/each}
</div>
