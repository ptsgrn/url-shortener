<script lang="ts">
	import { api, type AdminLink, type AdminUser, type Link } from '#lib/api.ts';
	import ChangeOwnerDialog from '#lib/components/ChangeOwnerDialog.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import EditLinkDialog from '#lib/components/EditLinkDialog.svelte';
	import LinkCard from '#lib/components/LinkCard.svelte';
	import LinkQrDialog from '#lib/components/LinkQrDialog.svelte';
	import StatsDialog from '#lib/components/StatsDialog.svelte';
	import { errorMessage } from '#lib/errors.ts';
	import { shortUrl } from '#lib/links.ts';
	import { toast } from 'svelte-sonner';

	type Item = Link | AdminLink;

	let {
		links = $bindable(),
		admin = false,
		empty = 'ยังไม่มีลิงก์'
	}: { links: Item[]; admin?: boolean; empty?: string } = $props();

	type Open = 'edit' | 'delete' | 'ban' | 'stats' | 'qr' | 'owner';
	let current = $state<Item | null>(null);
	const open = $state<Record<Open, boolean>>({
		edit: false,
		delete: false,
		ban: false,
		stats: false,
		qr: false,
		owner: false
	});

	function show(dialog: Open, link: Item) {
		current = link;
		open[dialog] = true;
	}

	/** Swaps in the server's copy, keeping fields only the admin list has (owner). */
	function replace(updated: Partial<Item> & { code: string }) {
		links = links.map((l) => (l.code === updated.code ? { ...l, ...updated } : l));
	}

	function fail(err: { status: number; value: unknown }) {
		toast.error(errorMessage(err));
		return false;
	}

	async function save(url: string) {
		const res = await api.v1.links({ code: current!.code }).patch({ url });
		if (res.error) return fail(res.error);
		replace(res.data);
		toast.success('บันทึกแล้ว');
	}

	async function toggle(link: Item) {
		const res = await api.v1.links({ code: link.code }).patch({ active: !!link.deactivatedAt });
		if (res.error) return fail(res.error);
		replace(res.data);
		toast.success(res.data.deactivatedAt ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว');
	}

	async function remove() {
		const code = current!.code;
		const res = await api.v1.links({ code }).delete();
		if (res.error) return fail(res.error);
		links = links.filter((l) => l.code !== code);
		toast.success('ลบลิงก์แล้ว');
	}

	async function changeOwner(user: AdminUser) {
		const res = await api.v1.links({ code: current!.code }).patch({ userId: user.id });
		if (res.error) return fail(res.error);
		const owner = { id: user.id, name: user.name, email: user.email };
		replace({ ...res.data, owner });
		toast.success(`เปลี่ยนเจ้าของเป็น ${user.name ?? user.email} แล้ว`);
	}

	async function ban(reason: string) {
		const target = api.v1.admin.links({ code: current!.code }).ban;
		const res = current!.bannedAt ? await target.delete() : await target.post({ reason });
		if (res.error) return fail(res.error);
		replace(res.data);
		toast.success(res.data.bannedAt ? 'ระงับลิงก์แล้ว' : 'ยกเลิกการระงับแล้ว');
	}
</script>

<div class="flex flex-col gap-3">
	{#each links as link (link.code)}
		<LinkCard
			{link}
			{admin}
			onedit={() => show('edit', link)}
			ontoggle={() => toggle(link)}
			ondelete={() => show('delete', link)}
			onstats={() => show('stats', link)}
			onqr={() => show('qr', link)}
			onban={() => show('ban', link)}
			onowner={() => show('owner', link)}
		/>
	{:else}
		<p class="py-8 text-center text-muted-foreground">{empty}</p>
	{/each}
</div>

{#if current}
	<EditLinkDialog bind:open={open.edit} code={current.code} url={current.url} onsave={save} />
	<ConfirmDialog
		bind:open={open.delete}
		title="ลบลิงก์ /{current.code}?"
		description="ลบแล้วกู้คืนไม่ได้ และจะใช้ชื่อลิงก์นี้ซ้ำไม่ได้อีก"
		confirmLabel="ลบ"
		onconfirm={remove}
	/>
	<ConfirmDialog
		bind:open={open.ban}
		title={current.bannedAt ? `ยกเลิกระงับ /${current.code}?` : `ระงับลิงก์ /${current.code}?`}
		description={current.bannedAt ? 'ลิงก์จะกลับมาใช้งานได้' : 'ลิงก์จะหยุดพาไปยังปลายทางทันที'}
		confirmLabel={current.bannedAt ? 'ยกเลิกระงับ' : 'ระงับ'}
		reason={!current.bannedAt}
		onconfirm={ban}
	/>
	<StatsDialog bind:open={open.stats} code={current.code} />
	{#if admin}
		<ChangeOwnerDialog
			bind:open={open.owner}
			code={current.code}
			currentOwnerId={current.userId}
			onsave={changeOwner}
		/>
	{/if}
	<LinkQrDialog
		bind:open={open.qr}
		title="QR Code"
		url={shortUrl(current.code)}
		code={current.code}
	/>
{/if}
