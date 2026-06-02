<script lang="ts">
	import { apiState } from "$lib/api.svelte";
	import { appState } from "$lib/appState.svelte";
	import { Block, Preloader } from "konsta/svelte";

	let { children } = $props();
</script>

{#if appState.isApiReachable}
	{@render children()}
{:else}
	<Block class="text-center">
		<div class="m-8">
			{t("Waiting for {apiState.url}...", apiState.url)}
		</div>
		<Preloader />
	</Block>
{/if}
