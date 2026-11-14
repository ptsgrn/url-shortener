<script lang="ts">
	import { page } from '$app/state';

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/');
</script>

<h1>Sign in</h1>
<!-- A full-page navigation to the API's OAuth redirect, not a SvelteKit route. -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a href={`/api/v1/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`} data-sveltekit-reload
	>Sign in with Google</a
>
