<script lang="ts">
	import { Navbar, Preloader } from "konsta/svelte";

	let { children, navbar, navbarLeft, navbarRight, subnavbar, title, loading } = $props();
</script>

<Navbar
	title={typeof title === "string" ? title : "Open Selves"}
	left={navbarLeft}
	right={navbarRight}
	{subnavbar}
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
