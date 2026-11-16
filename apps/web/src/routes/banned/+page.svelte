<script lang="ts">
	import BannedNotice from '#lib/components/BannedNotice.svelte';
</script>

<svelte:head>
	<title>คุณโดนแบน · MicroL</title>
</svelte:head>

<BannedNotice reason="ทำผิดนโยบายที่ 67" until={new Date(Date.now() + 7 * 24 * 3600 * 1000)} />
