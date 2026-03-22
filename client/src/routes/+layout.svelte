<script lang="ts">
	import "../app.css";

	import favicon from "$lib/assets/favicon.svg";
	import { App, Navbar, Page } from "konsta/svelte";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />

	<!-- Roboto font for web -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<App safeAreas>
	<div class="safe-areas">
		<Page>
			<Navbar title="Open Selves" />
			{@render children()}
		</Page>
	</div>
</App>
