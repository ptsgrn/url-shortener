<script lang="ts">
	import { api, type AdminUser } from '#lib/api.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let {
		open = $bindable(false),
		code,
		currentOwnerId,
		onsave
	}: {
		open?: boolean;
		code: string;
		currentOwnerId: string | null;
		/** Return `false` to keep the dialog open (e.g. the request failed). */
		onsave: (user: AdminUser) => Promise<boolean | void>;
	} = $props();

	let q = $state('');
	let users = $state<AdminUser[]>([]);
	let selected = $state<AdminUser | null>(null);
	let busy = $state(false);

	$effect(() => {
		if (!open) return;
		q = '';
		selected = null;
	});

	// Search as the admin types, keeping only the latest answer.
	$effect(() => {
		if (!open) return;
		const query = q.trim();
		let stale = false;
		const timer = setTimeout(async () => {
			const res = await api.v1.admin.users.get({ query: { q: query || undefined, limit: 8 } });
			if (!stale && res.data) users = res.data;
		}, 200);
		return () => {
			stale = true;
			clearTimeout(timer);
		};
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!selected) return;
		busy = true;
		const keepOpen = (await onsave(selected)) === false;
		busy = false;
		if (!keepOpen) open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="rounded-md border border-brand sm:max-w-85">
		<form onsubmit={submit} class="flex flex-col gap-4">
			<Dialog.Header>
				<Dialog.Title class="text-2xl">เปลี่ยนเจ้าของ /{code}</Dialog.Title>
				<Dialog.Description>เจ้าของใหม่จะจัดการลิงก์นี้ได้แทน</Dialog.Description>
			</Dialog.Header>
			<label class="flex flex-col gap-1 text-sm">
				ค้นหาผู้ใช้
				<input
					bind:value={q}
					placeholder="ชื่อหรืออีเมล"
					class="h-10 rounded-md border border-input bg-card px-3 text-base"
				/>
			</label>
			<fieldset class="flex max-h-60 flex-col gap-1 overflow-y-auto">
				<legend class="sr-only">ผู้ใช้</legend>
				{#each users as user (user.id)}
					<label
						class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm has-checked:bg-muted"
					>
						<input
							type="radio"
							name="owner"
							value={user.id}
							checked={selected?.id === user.id}
							disabled={user.id === currentOwnerId}
							onchange={() => (selected = user)}
						/>
						<span class="min-w-0 flex-1 truncate">
							{user.name ?? 'ไม่มีชื่อ'}
							<span class="text-muted-foreground">{user.email ?? ''}</span>
						</span>
						{#if user.id === currentOwnerId}<span class="text-xs">เจ้าของปัจจุบัน</span>{/if}
					</label>
				{:else}
					<p class="py-2 text-center text-sm text-muted-foreground">ไม่พบผู้ใช้</p>
				{/each}
			</fieldset>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>ยกเลิก</Button>
				<Button type="submit" disabled={busy || !selected}>เปลี่ยนเจ้าของ</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
