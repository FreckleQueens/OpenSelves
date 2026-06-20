<script lang="ts">
	import ErrorDialog from "$lib/components/ErrorDialog.svelte";
	import { gotoHomeRoute } from "$lib/routing-utils";

	// This is a special case
	// eslint-disable-next-line svelte/valid-prop-names-in-kit-pages
	let { error } = $props();

	async function onDismiss() {
		await gotoHomeRoute(
			{
				dismissed_error: "1",
			},
			true,
		);
	}
</script>

<ErrorDialog additionalErrors={[error]} {onDismiss} />
