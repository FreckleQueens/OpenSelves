<script lang="ts">
	import type { OSIconProps } from "$lib/components/os-icon";
	import { Icon } from "konsta/svelte";

	let {
		button = false,
		fab = false,
		input = false,
		before = false,
		after = false,
		class: classNames,
		...restProps
	}: OSIconProps = $props();

	const classes: string = $derived.by(() => {
		const vals: string[] = [];
		if (button || fab || input) {
			vals.push("text-xl");
		}
		if (before) {
			vals.push("mr-2");
		}
		if (after) {
			vals.push("ml-1");
		}
		if (classNames) {
			vals.push(classNames);
		}
		return vals.join(" ");
	});
</script>

<Icon class={classes} {...restProps} />
