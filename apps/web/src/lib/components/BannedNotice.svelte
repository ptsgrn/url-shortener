<script lang="ts">
	import banned from '#lib/assets/banned.png';
	import { logout } from '#lib/auth.ts';
	import { Button } from '#lib/components/ui/button/index.js';

	let { reason, until }: { reason?: string | null; until?: Date | null } = $props();

	const dateTime = new Intl.DateTimeFormat('th', { dateStyle: 'long', timeStyle: 'short' });
</script>

<div class="-mt-6 flex flex-col items-center text-center">
	<img src={banned} alt="" width="223" height="223" />
	<h1 class="mt-6 text-[40px] leading-tight font-semibold">คุณโดนแบน</h1>
	{#if reason}
		<p class="mt-8 text-base">เนื่องจาก <span class="text-brand">{reason}</span></p>
	{/if}
	{#if until}
		<p class="mt-2 text-base">ปลดแบนวันที่ {dateTime.format(until)}</p>
	{/if}
</div>

<Button size="xl" class="mt-6" onclick={logout}>ออกจากระบบ</Button>
