<script lang="ts">
	import BackIcon from "$lib/components/icons/BackIcon.svelte";
	import { Link } from "konsta/svelte";

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
	<BackIcon button />
</Link>
