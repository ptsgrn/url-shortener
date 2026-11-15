<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { copy } from '#lib/links.ts';

	let {
		open = $bindable(false),
		title,
		url,
		code
	}: { open?: boolean; title: string; url: string; code: string } = $props();

	// qrcode's default entry pulls in Node-only code, so load it on demand in the browser.
	const qr = $derived(
		import('qrcode').then((QRCode) => QRCode.toDataURL(url, { width: 480, margin: 1 }))
	);

	const pinkButton = 'rounded-md bg-primary px-3 text-xl font-medium hover:bg-primary/80';
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex max-w-85 flex-col items-center gap-4 rounded-md border border-brand px-4 pt-8 pb-12 ring-0 sm:max-w-85"
	>
		<Dialog.Title class="text-[40px] leading-tight font-medium">{title}</Dialog.Title>

		<div class="size-60 border border-brand p-1">
			{#await qr then src}
				<img {src} alt="QR code for {url}" class="size-full" />
			{/await}
		</div>

		{#await qr then src}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- data: URL download -->
			<a href={src} download="microl-{code}.png" class="{pinkButton} flex h-10 items-center">
				ดาวน์โหลด QR Code
			</a>
		{/await}

		<div class="flex w-full items-center gap-2 text-xl text-foreground/50">
			<hr class="flex-1 border-muted-foreground" />
			หรือ
			<hr class="flex-1 border-muted-foreground" />
		</div>

		<p class="w-full truncate rounded-md bg-muted px-2 text-center text-lg">{url}</p>

		<button type="button" class="{pinkButton} h-7.5 w-22.5" onclick={() => copy(url)}>คัดลอก</button
		>
	</Dialog.Content>
</Dialog.Root>
