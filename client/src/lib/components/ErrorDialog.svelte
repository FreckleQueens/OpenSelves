<script lang="ts">
	import { globalError } from "$lib/global-error-handling.svelte.js";
	import Icon from "@iconify/svelte";
	import { Button, Dialog, useTheme } from "konsta/svelte";

	let { additionalErrors = [], onDismiss = undefined } = $props();
	let errors = $derived([...additionalErrors.filter((error) => !!error), ...globalError]);

	async function copyErrorToClipboard() {
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/plain": JSON.stringify(errors, null, 2),
			}),
		]);
	}

	async function dismissError() {
		globalError.splice(0, globalError.length);
		onDismiss?.();
	}
</script>

<Dialog opened={errors.length > 0}>
	{#snippet title()}
		<span>
			<Icon
				icon={useTheme() === "ios"
					? "f7:exclamationmark-octagon"
					: "ic:outline-error-outline"}
				class="inline text-brand-red"
			/>
			Application error
		</span>
	{/snippet}

	<code class="block max-h-64 overflow-scroll whitespace-pre"
		>{JSON.stringify(errors, null, 2)}</code
	>

	{#snippet buttons()}
		<Button class="k-color-brand-red" onclick={dismissError}>
			<Icon
				icon={useTheme() === "ios" ? "f7:xmark" : "ic:round-close"}
				class="text-2xl mr-2"
			/>
			Dismiss
		</Button>
		<Button class="k-color-brand-primary" onclick={copyErrorToClipboard}>
			<Icon
				icon={useTheme() === "ios" ? "f7:doc-on-clipboard-fill" : "ic:round-content-copy"}
				class="text-2xl mr-2"
			/>
			Copy
		</Button>
	{/snippet}
</Dialog>
