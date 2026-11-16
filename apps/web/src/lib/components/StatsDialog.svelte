<script lang="ts">
	import { api, type Stats } from '#lib/api.ts';
	import BarList from '#lib/components/BarList.svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { errorMessage } from '#lib/errors.ts';

	let { open = $bindable(false), code }: { open?: boolean; code: string } = $props();

	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	/** Ranges in days ending today; `null` is all time (the chart then shows the last 30 days). */
	const ranges = [
		{ days: 7, label: '7 วัน' },
		{ days: 30, label: '30 วัน' },
		{ days: 90, label: '90 วัน' },
		{ days: null, label: 'ทั้งหมด' }
	] as const;
	// Raw, not a proxy: the buttons compare it with `ranges` by identity.
	let range = $state.raw<(typeof ranges)[number]>(ranges[1]);
	const chartDays = $derived(range.days ?? 30);

	let stats = $state<Stats | null>(null);
	let failed = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		stats = null;
		failed = null;
		const from = range.days ? day(1 - range.days) : undefined;
		api.v1
			.stats({ code })
			.get({ query: { tz: timeZone, from } })
			.then((res) => (res.error ? (failed = errorMessage(res.error)) : (stats = res.data)));
	});

	/** `YYYY-MM-DD` in the viewer's time zone, `offset` days from today. */
	const day = (offset: number) =>
		new Intl.DateTimeFormat('en-CA', { timeZone }).format(Date.now() + offset * 86_400_000);

	// `daily` only lists days with visits; the chart shows every recent day.
	const days = $derived.by(() => {
		const counts = new Map(stats?.daily.map((d) => [d.date, d.count]));
		return Array.from({ length: chartDays }, (_, i) => {
			const date = day(i - chartDays + 1);
			return { date, count: counts.get(date) ?? 0 };
		});
	});
	const today = $derived(days.at(-1)?.count ?? 0);
	const max = $derived(Math.max(1, ...days.map((d) => d.count)));

	const shortDate = new Intl.DateTimeFormat('th', { day: 'numeric', month: 'short' });
	const label = (date: string) => shortDate.format(new Date(`${date}T00:00`));

	const devices = {
		mobile: 'มือถือ',
		tablet: 'แท็บเล็ต',
		desktop: 'คอมพิวเตอร์',
		unknown: 'ไม่ทราบ'
	};
	const unknown = { unknown: 'ไม่ทราบ' };
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto rounded-md border border-brand sm:max-w-95">
		<Dialog.Title class="text-xl">สถิติการเข้าชม /{code}</Dialog.Title>

		<div role="group" aria-label="ช่วงเวลา" class="flex gap-1 rounded-md bg-muted p-1 text-sm">
			{#each ranges as r (r.label)}
				<button
					type="button"
					aria-pressed={range === r}
					class="flex-1 rounded-sm py-1 aria-pressed:bg-card aria-pressed:font-medium"
					onclick={() => (range = r)}>{r.label}</button
				>
			{/each}
		</div>

		{#if failed}
			<p role="alert" class="text-destructive">{failed}</p>
		{:else if !stats}
			<p class="text-muted-foreground">กำลังโหลด…</p>
		{:else}
			<div class="grid grid-cols-2 gap-3">
				{#each [{ name: 'การเข้าชมวันนี้', n: today }, { name: range.days ? `การเข้าชม ${range.label}` : 'การเข้าชมทั้งหมด', n: stats.total }] as tile (tile.name)}
					<div class="flex flex-col rounded-md bg-primary px-3 py-2">
						<span class="text-sm font-medium">{tile.name}</span>
						<span class="text-right text-4xl leading-tight tabular-nums">
							{tile.n.toLocaleString('th')}<span class="ml-1 text-sm">ครั้ง</span>
						</span>
					</div>
				{/each}
			</div>

			<section class="flex flex-col gap-1.5">
				<h3 class="text-sm font-medium">การเข้าชม {chartDays} วันล่าสุด</h3>
				<div
					class="flex h-24 items-end gap-0.5 border-b border-muted-foreground/40"
					aria-hidden="true"
				>
					{#each days as d (d.date)}
						<div
							class="group relative flex h-full flex-1 items-end justify-center"
							title="{label(d.date)}: {d.count}"
						>
							<div
								class="w-full max-w-6 rounded-t-[4px] bg-brand"
								style:height="{(d.count / max) * 100}%"
							></div>
						</div>
					{/each}
				</div>
				<div class="flex justify-between text-[10px] text-muted-foreground" aria-hidden="true">
					<span>{label(days[0].date)}</span>
					<span>สูงสุด {max === 1 && !days.some((d) => d.count) ? 0 : max} ครั้ง/วัน</span>
					<span>{label(days[chartDays - 1].date)}</span>
				</div>
				<details class="text-xs">
					<summary class="cursor-pointer text-muted-foreground">ดูเป็นตาราง</summary>
					<table class="mt-1 w-full">
						<thead
							><tr><th class="text-left">วันที่</th><th class="text-right">ครั้ง</th></tr></thead
						>
						<tbody>
							{#each days as d (d.date)}
								<tr><td>{label(d.date)}</td><td class="text-right tabular-nums">{d.count}</td></tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>

			<BarList title="แบ่งตามอุปกรณ์" counts={stats.devices} labels={devices} />
			<BarList title="แบ่งตามเบราว์เซอร์" counts={stats.browsers} labels={unknown} />
			<BarList
				title="แบ่งตาม referrer"
				counts={stats.referrers}
				labels={{ unknown: 'เข้าโดยตรง / ไม่ทราบ' }}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
