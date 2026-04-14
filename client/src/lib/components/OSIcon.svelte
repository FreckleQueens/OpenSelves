<script lang="ts">
	import type { OSIconProps } from "$lib/components/os-icon";
	import { Icon } from "konsta/svelte";

	let {
		secondaryIcon = undefined,
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
		if (secondaryIcon) {
			vals.push("has-secondary-icon");
		}
		return vals.join(" ");
	});
</script>

<Icon class={classes} {...restProps}>
	{#if secondaryIcon}
		<div class="secondary-icon">
			{@render secondaryIcon()}
		</div>
	{/if}
</Icon>

<style lang="scss">
	:global .has-secondary-icon > svg {
		mask: radial-gradient(circle at 80% 80%, transparent 30%, black 30%);
		mask-repeat: no-repeat;
	}
	.secondary-icon {
		position: absolute;
		left: 80%;
		top: 80%;

		transform: translate(-50%, -50%) scale(70%);
		mask: none;
	}
</style>
