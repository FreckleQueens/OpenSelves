<script lang="ts">
	import type { OSFormData } from "$lib/forms";
	import { Button, Preloader } from "konsta/svelte";
	import type { Snippet } from "svelte";

	let {
		children = $bindable(),
		formState = $bindable(),
	}: { children: Snippet; formState: OSFormData } = $props();
</script>

<Button id={formState.name + "-button"} type="submit" tonal disabled={formState.isWorking}>
	{#if formState.isWorking}
		{formState.workingStatus} <Preloader class="w-4 ml-2" />
	{:else}
		{@render children()}
	{/if}
</Button>
