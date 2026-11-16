<script lang="ts">
	import { api } from '#lib/api.ts';
	import LinkCard from '#lib/components/LinkCard.svelte';
	import LinkQrDialog from '#lib/components/LinkQrDialog.svelte';
	import { displayUrl, shortUrl } from '#lib/links.ts';
	import { AuthError, InternalError, LinkError } from 'api/errors';
	import { toast } from 'svelte-sonner';

	type Link = { code: string; url: string; createdAt: Date };

	let url = $state('');
	let customCode = $state('');
	let submitting = $state(false);
	// There is no "list my links" endpoint yet, so this only holds links made in this tab.
	let recent = $state<Link[]>([]);
	let dialog = $state<{ link: Link; title: string } | null>(null);
	let dialogOpen = $state(false);

	const errors: Record<
		| AuthError.Unauthorized
		| AuthError.Forbidden
		| LinkError.Blocked
		| LinkError.CodeTaken
		| InternalError,
		string
	> = {
		[AuthError.Unauthorized]: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
		[AuthError.Forbidden]: 'บัญชีของคุณถูกระงับ จึงสร้างลิงก์ไม่ได้',
		[LinkError.Blocked]: 'ไม่อนุญาตให้สร้างลิงก์ไปยังเว็บไซต์นี้',
		[LinkError.CodeTaken]: 'ชื่อลิงก์นี้ถูกใช้แล้ว ลองชื่ออื่น',
		[InternalError.Database]: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
		[InternalError.Crypto]: 'เกิดข้อผิดพลาด กรุณาลองใหม่'
	};

	function showQr(link: Link, title: string) {
		dialog = { link, title };
		dialogOpen = true;
	}

	async function shorten(event: SubmitEvent) {
		event.preventDefault();
		if (customCode) {
			toast.error('ยังไม่รองรับการตั้งชื่อลิงก์เอง เว้นว่างไว้เพื่อสุ่มลิงก์');
			return;
		}
		submitting = true;
		const res = await api.v1.links.post({ url });
		submitting = false;
		if (res.error) {
			toast.error(
				res.error.status === 422 ? 'กรุณาใส่ URL ที่ถูกต้อง' : errors[res.error.value.error]
			);
			return;
		}
		const link = { ...res.data, createdAt: new Date() };
		recent = [link, ...recent];
		url = '';
		showQr(link, 'สร้างลิงก์สำเร็จ!');
	}
</script>

<form onsubmit={shorten} class="flex flex-col">
	<h1 class="text-center text-[40px] leading-tight font-semibold">
		<label for="url">วางลิงค์ URL</label>
	</h1>
	<input
		id="url"
		type="url"
		required
		bind:value={url}
		placeholder="https://example.com/a-very-long-link"
		class="mt-5 h-11 rounded-md border border-input bg-card px-5 text-[15px] placeholder:text-[#979797]"
	/>

	<label for="code" class="mt-5 text-xl">ลิงค์ URL ใหม่</label>
	<div class="mt-2 flex items-center">
		<span class="text-xl">{displayUrl(shortUrl(''))}</span>
		<input
			id="code"
			bind:value={customCode}
			placeholder="เว้นว่างเพื่อสุ่มลิงก์อัตโนมัติ"
			class="h-5 min-w-0 flex-1 rounded-sm bg-muted px-2 text-xs placeholder:text-foreground/60"
		/>
	</div>

	<button
		type="submit"
		disabled={submitting}
		class="mt-8 h-17.5 rounded-md bg-primary text-5xl font-semibold hover:bg-primary/80 disabled:opacity-50"
		>สร้างลิงค์</button
	>
</form>

{#if recent.length}
	<section class="mt-7 flex flex-col gap-3 px-1.25">
		<h2 class="text-xl font-medium">ลิงก์ที่สร้างล่าสุด</h2>
		{#each recent as link (link.code)}
			<LinkCard {...link} onqr={() => showQr(link, 'QR Code')} />
		{/each}
	</section>
{/if}

{#if dialog}
	<LinkQrDialog
		bind:open={dialogOpen}
		title={dialog.title}
		url={shortUrl(dialog.link.code)}
		code={dialog.link.code}
	/>
{/if}
