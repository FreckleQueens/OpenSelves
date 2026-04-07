<script lang="ts">
	import "../app.css";

	import favicon from "$lib/assets/favicon.svg";
	import { App, Page } from "konsta/svelte";

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

<App safeAreas theme={isIos() ? "ios" : "material"}>
	<div class="safe-areas">
		<Page class="bg-md-light-surface-darker dark:bg-md-dark-surface-darker">
			<div class="frame bg-md-light-surface dark:bg-md-dark-surface">
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
