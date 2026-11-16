<script lang="ts">
	import remove from '#lib/assets/remove.svg';
	import { toast } from 'svelte-sonner';
	import { rules } from '../sample.ts';

	type List = 'whitelist' | 'blacklist';

	type Row = { id: string; value: string };

	const rows = (patterns: string[]): Row[] =>
		patterns.map((value) => ({ id: crypto.randomUUID(), value }));

	const lists = $state({ whitelist: rows(rules.whitelist), blacklist: rows(rules.blacklist) });

	function isValid(pattern: string) {
		try {
			new RegExp(pattern);
			return true;
		} catch {
			return false;
		}
	}

	function save(list: List) {
		const patterns = lists[list].map((r) => r.value.trim()).filter(Boolean);
		const invalid = patterns.filter((p) => !isValid(p));
		if (invalid.length) {
			toast.error(`Regex ไม่ถูกต้อง: ${invalid.join(', ')}`);
			return;
		}
		lists[list] = rows(patterns);
		toast.info('ยังไม่ได้บันทึก: ยังไม่มี API สำหรับการตั้งค่า');
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

{#each ['whitelist', 'blacklist'] as const as list (list)}
	<section class="mt-6 pr-9 pl-3">
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-medium capitalize">{list}</h2>
			<button type="button" class="text-sm text-brand" onclick={() => save(list)}>บันทึก</button>
		</div>
		<div class="mt-1 flex flex-col gap-2 rounded-md bg-muted px-2.75 pt-3 pb-2">
			{#each lists[list] as row, i (row.id)}
				<div
					class={[
						'flex h-6 items-center rounded-md border bg-card pr-1 pl-1.5',
						isValid(row.value) ? 'border-foreground' : 'border-destructive'
					]}
				>
					<input
						bind:value={row.value}
						aria-label="{list} pattern {i + 1}"
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
			{/each}
			<button
				type="button"
				class="text-sm text-brand"
				onclick={() => lists[list].push(...rows(['']))}>เพิ่ม</button
			>
		</div>
	</section>
{/each}
