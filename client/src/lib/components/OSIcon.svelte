<script lang="ts">
	import type { OSIconProps } from "$lib/components/os-icon";
	import { Icon } from "konsta/svelte";

	let {
		material: MaterialIcon = undefined,
		ios: IosIcon = undefined,
		all: AllIcon = undefined,
		secondary: SecondaryIcon = undefined,
		iconProps = {},
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
		if (SecondaryIcon) {
			vals.push("has-secondary-icon");
		}
		return vals.join(" ");
	});
</script>

<Icon class={classes} {...restProps}>
	{#if SecondaryIcon}
		<div class="secondary-icon">
			<SecondaryIcon />
		</div>
	{/if}

	{#snippet material()}
		{#if MaterialIcon}
			<MaterialIcon {...iconProps} />
		{/if}

		{#if AllIcon}
			<AllIcon {...iconProps} />
		{/if}
	{/snippet}

	{#snippet ios()}
		{#if IosIcon}
			<IosIcon {...iconProps} />
		{/if}

		{#if AllIcon}
			<AllIcon {...iconProps} />
		{/if}
	{/snippet}
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
