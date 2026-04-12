<script lang="ts">
	import AppErrorIcon from "$lib/components/icons/AppErrorIcon.svelte";
	import CopyIcon from "$lib/components/icons/CopyIcon.svelte";
	import DismissIcon from "$lib/components/icons/DismissIcon.svelte";
	import { globalError } from "$lib/global-error-handling.svelte.js";
	import { Button, Dialog } from "konsta/svelte";

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

<Dialog
	id="application-error-dialog"
	opened={errors.length > 0}
	class={errors.length > 0 ? "has-errors" : ""}
>
	{#snippet title()}
		<span>
			<AppErrorIcon class="inline text-brand-red" />
			Application error
		</span>
	{/snippet}

	<code class="block max-h-64 overflow-scroll whitespace-pre"
		>{JSON.stringify(errors, null, 2)}</code
	>

	{#snippet buttons()}
		<Button class="k-color-brand-red" onclick={dismissError}>
			<DismissIcon button before />
			Dismiss
		</Button>
		<Button class="k-color-brand-primary" onclick={copyErrorToClipboard}>
			<CopyIcon button before />
			Copy
		</Button>
	{/snippet}
</Dialog>
