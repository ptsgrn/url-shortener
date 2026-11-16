<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import remove from '#lib/assets/remove.svg';
	import { api, type Rule } from '#lib/api.ts';
	import { errorMessage } from '#lib/errors.ts';
	import { toast } from 'svelte-sonner';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type List = Rule['list'];
	type Type = Rule['type'];
	/** A row being edited; `saved` is the rule as stored, absent for new rows. */
	type Row = { key: string; type: Type; pattern: string; saved?: Rule };

	const toRow = (rule: Rule): Row => ({
		key: rule.id,
		type: rule.type,
		pattern: rule.pattern,
		saved: rule
	});

	// Rows are edited in place (push, splice, bind:value), which needs $state's deep proxy.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let lists = $state<Record<List, Row[]>>({ whitelist: [], blacklist: [] });
	$effect(() => {
		lists = {
			whitelist: data.rules.filter((r) => r.list === 'whitelist').map(toRow),
			blacklist: data.rules.filter((r) => r.list === 'blacklist').map(toRow)
		};
	});

	let saving = $state<List | null>(null);

	function addRow(list: List) {
		lists[list].push({ key: crypto.randomUUID(), type: 'domain', pattern: '' });
	}

	/** Applies one list's edits as creates, updates and deletes; stops at the first error. */
	async function save(list: List) {
		saving = list;
		const rows = lists[list].filter((r) => r.pattern.trim());
		const kept = new Set(rows.map((r) => r.saved?.id));
		const removed = data.rules.filter((r) => r.list === list && !kept.has(r.id));

		const steps = [
			...removed.map((rule) => ({
				pattern: rule.pattern,
				run: () => api.v1.rules({ id: rule.id }).delete()
			})),
			...rows
				.filter((r) => !r.saved)
				.map((r) => ({
					pattern: r.pattern,
					run: () => api.v1.rules.post({ list, type: r.type, pattern: r.pattern.trim() })
				})),
			...rows
				.filter((r) => r.saved && (r.saved.pattern !== r.pattern.trim() || r.saved.type !== r.type))
				.map((r) => ({
					pattern: r.pattern,
					run: () =>
						api.v1.rules({ id: r.saved!.id }).patch({ type: r.type, pattern: r.pattern.trim() })
				}))
		];

		for (const step of steps) {
			const res = await step.run();
			if (res.error) {
				toast.error(`${step.pattern}: ${errorMessage(res.error)}`);
				break;
			}
		}
		await invalidateAll();
		saving = null;
		if (steps.length) toast.success('บันทึกแล้ว');
	}
</script>

<svelte:head>
	<title>การตั้งค่า · MicroL</title>
</svelte:head>

<h1 class="pl-4 text-[32px] leading-tight font-medium">การตั้งค่า</h1>
<h2 class="mt-5 pl-5 text-xl">เงื่อนไขลิงก์ที่อนุญาต</h2>
<p class="mt-2 mr-9 ml-3 rounded-md bg-primary px-1.5 py-1 text-[13px]">
	ลิงก์ต้องตรงกับ Whitelist อย่างน้อย 1 รายการ และต้องไม่ตรงกับ blacklist เลย
</p>
<p class="mt-2 mr-9 ml-3 text-xs text-muted-foreground">
	โดเมน: ชื่อโดเมนตรงตัว เช่น <code>chula.ac.th</code> หรือ <code>*.chula.ac.th</code> รวมโดเมนย่อย ·
	Regex: ตรวจกับชื่อโดเมน (RE2)
</p>

{#each ['whitelist', 'blacklist'] as const as list (list)}
	<section class="mt-6 pr-9 pl-3">
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-medium capitalize">{list}</h2>
			<button
				type="button"
				class="text-sm text-brand disabled:opacity-50"
				disabled={saving !== null}
				onclick={() => save(list)}>{saving === list ? 'กำลังบันทึก…' : 'บันทึก'}</button
			>
		</div>
		<div class="mt-1 flex flex-col gap-2 rounded-md bg-muted px-2.75 pt-3 pb-2">
			{#each lists[list] as row, i (row.key)}
				<div class="flex h-6 items-center gap-1 rounded-md border border-foreground bg-card pr-1">
					<select
						bind:value={row.type}
						aria-label="ประเภทกฎ {list} {i + 1}"
						class="h-full rounded-l-md border-r border-foreground bg-muted px-1 text-[10px]"
					>
						<option value="domain">โดเมน</option>
						<option value="regex">Regex</option>
					</select>
					<input
						bind:value={row.pattern}
						aria-label="{list} {i + 1}"
						placeholder={row.type === 'domain' ? '*.example.com' : '^(www\\.)?example\\.com$'}
						class="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
					/>
					<button
						type="button"
						aria-label="ลบ"
						onclick={() => lists[list].splice(i, 1)}
						class="shrink-0"
					>
						<img src={remove} alt="" width="17" height="17" />
					</button>
				</div>
			{:else}
				<p class="text-center text-xs text-muted-foreground">ยังไม่มีกฎ</p>
			{/each}
			<button type="button" class="text-sm text-brand" onclick={() => addRow(list)}>เพิ่ม</button>
		</div>
	</section>
{/each}
