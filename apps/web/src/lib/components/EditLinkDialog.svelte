<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let {
		open = $bindable(false),
		code,
		url,
		onsave
	}: {
		open?: boolean;
		code: string;
		url: string;
		/** Return `false` to keep the dialog open (e.g. the request failed). */
		onsave: (url: string) => Promise<boolean | void>;
	} = $props();

	let value = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) value = url;
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const keepOpen = (await onsave(value.trim())) === false;
		busy = false;
		if (!keepOpen) open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="rounded-md border border-brand sm:max-w-85">
		<form onsubmit={submit} class="flex flex-col gap-4">
			<Dialog.Header>
				<Dialog.Title class="text-2xl">แก้ไขลิงก์</Dialog.Title>
				<Dialog.Description>เปลี่ยนปลายทางของ /{code}</Dialog.Description>
			</Dialog.Header>
			<label class="flex flex-col gap-1 text-sm">
				ลิงก์ปลายทาง
				<input
					type="url"
					required
					bind:value
					class="h-10 rounded-md border border-input bg-card px-3 text-base"
				/>
			</label>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>ยกเลิก</Button>
				<Button type="submit" disabled={busy || value.trim() === url}>บันทึก</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
