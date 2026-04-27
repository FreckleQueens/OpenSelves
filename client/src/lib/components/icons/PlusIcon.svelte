<script lang="ts">
	import OSIcon from "$lib/components/OSIcon.svelte";
	import type { OSIconProps } from "$lib/components/os-icon.d.ts";

	let props: Omit<OSIconProps, "material" | "ios"> = $props();
</script>

<OSIcon material={IconIcRoundPlus} ios={IconF7Plus} {...props} />
