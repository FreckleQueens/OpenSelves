<script lang="ts">
	import OSIcon from "$lib/components/OSIcon.svelte";
	import type { OSIconProps } from "$lib/components/os-icon";

	let props: Omit<OSIconProps, "material" | "ios"> = $props();
</script>

<OSIcon material={IconIcRoundPeople} ios={IconF7Person2Fill} {...props} />
