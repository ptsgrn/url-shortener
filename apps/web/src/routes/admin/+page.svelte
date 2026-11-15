<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<svelte:head>
	<title>ผู้ดูแลระบบ · MicroL</title>
</svelte:head>

<h1 class="text-center text-[40px] leading-tight font-semibold">สวัสดีคุณ Admin</h1>
<nav class="mt-8 flex flex-col gap-8">
	<Button href={resolve('/admin/links')} size="xl">รายการลิงก์ทั้งหมด</Button>
	<Button href={resolve('/admin/users')} size="xl">บัญชีผู้ใช้</Button>
	<Button href={resolve('/admin/settings')} size="xl">การตั้งค่า</Button>
</nav>
