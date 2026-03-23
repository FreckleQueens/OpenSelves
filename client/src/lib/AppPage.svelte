<script lang="ts">
	import { Navbar, Preloader } from "konsta/svelte";

	let { children, navbar, navbarLeft, navbarRight, title, loading } = $props();
</script>

<Navbar
	title={typeof title === "string" ? title : "Open Selves"}
	left={navbarLeft}
	right={navbarRight}
>
	{#if loading}{:else if navbar}
		{@render navbar()}
	{/if}
</Navbar>

{#if loading}
	<Preloader />
{:else}
	{@render children()}
{/if}
