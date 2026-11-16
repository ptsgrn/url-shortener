<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel,
		reason: askReason = false,
		onconfirm
	}: {
		open?: boolean;
		title: string;
		description?: string;
		confirmLabel: string;
		/** Ask for a required reason, passed to `onconfirm`. */
		reason?: boolean;
		/** Return `false` to keep the dialog open (e.g. the request failed). */
		onconfirm: (reason: string) => Promise<boolean | void>;
	} = $props();

	let reason = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) reason = '';
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const keepOpen = (await onconfirm(reason.trim())) === false;
		busy = false;
		if (!keepOpen) open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="rounded-md border border-brand sm:max-w-85">
		<form onsubmit={submit} class="flex flex-col gap-4">
			<Dialog.Header>
				<Dialog.Title class="text-2xl">{title}</Dialog.Title>
				{#if description}<Dialog.Description>{description}</Dialog.Description>{/if}
			</Dialog.Header>
			{#if askReason}
				<label class="flex flex-col gap-1 text-sm">
					เหตุผล
					<textarea
						bind:value={reason}
						required
						rows="3"
						class="rounded-md border border-input bg-card px-3 py-2 text-base"></textarea>
				</label>
			{/if}
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>ยกเลิก</Button>
				<Button type="submit" disabled={busy || (askReason && !reason.trim())}>
					{confirmLabel}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
