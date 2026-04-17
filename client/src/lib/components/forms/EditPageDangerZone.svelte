<script lang="ts">
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import { Block, BlockTitle } from "konsta/svelte";
	import type { Snippet } from "svelte";

	let { children }: { children: Snippet } = $props();
</script>

<BlockTitle class="text-brand-red">
	<p class="flex items-center border-b flex-1">
		<DangerIcon class="text-xl mr-1" />
		Danger zone
	</p>
</BlockTitle>
<Block>
	{@render children()}
</Block>
