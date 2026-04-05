<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import ErrorDialog from "$lib/ErrorDialog.svelte";

	// This is a special case
	// eslint-disable-next-line svelte/valid-prop-names-in-kit-pages
	let { error } = $props();

	async function onDismiss() {
		await goto(resolve("/"));
		window.location.reload();
	}
</script>

<ErrorDialog additionalErrors={[error]} {onDismiss} />
