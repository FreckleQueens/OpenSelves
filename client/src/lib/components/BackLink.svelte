<script lang="ts">
	import Icon from "@iconify/svelte";
	import { Link, useTheme } from "konsta/svelte";

	let {
		onClick = () => {
			if (!href) {
				history.back();
			}
		},
		href = null,
	}: {
		onClick?: (e: MouseEvent) => Promise<void> | void;
		href?: string | null;
	} = $props();
</script>

<Link onclick={onClick} {href} id="back-link">
	<Icon icon={useTheme() === "ios" ? "f7:arrow-left" : "ic:round-arrow-back"} class="text-2xl" />
</Link>
