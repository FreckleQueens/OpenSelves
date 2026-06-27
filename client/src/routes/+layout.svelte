<script lang="ts">
	import "../app.css";

	import { App, Page } from "konsta/svelte";
	import { onDestroy, onMount } from "svelte";

	let { children } = $props();

	function isIos() {
		return (
			[
				"iPad Simulator",
				"iPhone Simulator",
				"iPod Simulator",
				"iPad",
				"iPhone",
				"iPod",
			].includes(navigator.platform) ||
			// iPad on iOS 13 detection
			(navigator.userAgent.includes("Mac") && "ontouchend" in document)
		);
	}

	let mounted: boolean = $state(false);
	onMount(() => {
		mounted = true;
	});
	onDestroy(() => {
		mounted = false;
	});
</script>

<svelte:head>
	<!-- Roboto font for web -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if mounted}
	<div class="hidden layout-mounted"></div>
{/if}

<App safeAreas theme={isIos() ? "ios" : "material"}>
	<div class="safe-areas">
		<Page class="material:bg-md-light-surface-darker material:dark:bg-md-dark-surface-darker">
			<div
				class="frame material:bg-md-light-surface material:dark:bg-md-dark-surface flex flex-col ios:dark:text-white"
			>
				{@render children()}
			</div>
		</Page>
	</div>
</App>

<style lang="scss">
	.frame {
		position: relative;
		max-width: 75vh;
		margin-left: auto;
		margin-right: auto;
		height: 100%;
		overflow: hidden;
	}
</style>
