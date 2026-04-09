<script lang="ts">
	import OSIcon from "$lib/components/OSIcon.svelte";
	import type { OSIconProps } from "$lib/components/os-icon";

	let props: Omit<OSIconProps, "material" | "ios"> = $props();
</script>

<OSIcon {...props}>
	{#snippet material()}
		<IconIcBaselineError />
	{/snippet}
	{#snippet ios()}
		<IconF7ExclamationmarkCircle />
	{/snippet}
</OSIcon>
