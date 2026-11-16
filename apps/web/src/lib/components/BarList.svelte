<script lang="ts">
	let {
		title,
		counts,
		labels = {}
	}: {
		title: string;
		counts: Record<string, number>;
		/** Display names for keys, e.g. `{ mobile: 'มือถือ' }`. */
		labels?: Record<string, string>;
	} = $props();

	const rows = $derived(
		Object.entries(counts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 6)
	);
	const max = $derived(Math.max(1, ...rows.map(([, n]) => n)));
</script>

<section class="flex flex-col gap-1.5">
	<h3 class="text-sm font-medium">{title}</h3>
	{#if rows.length}
		<dl class="flex flex-col gap-1.5 text-xs">
			{#each rows as [key, n] (key)}
				<div
					class="grid grid-cols-[6rem_1fr_auto] items-center gap-2"
					title="{labels[key] ?? key}: {n}"
				>
					<dt class="truncate">{labels[key] ?? key}</dt>
					<dd class="h-3 rounded-r-[4px] bg-brand" style:width="{(n / max) * 100}%"></dd>
					<dd class="tabular-nums text-muted-foreground">{n}</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<p class="text-xs text-muted-foreground">ยังไม่มีข้อมูล</p>
	{/if}
</section>
