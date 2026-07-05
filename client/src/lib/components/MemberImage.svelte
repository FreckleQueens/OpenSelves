<script lang="ts">
	import PersonIcon from "$lib/components/icons/PersonIcon.svelte";
	import type { MemberStatic } from "openselves-common/client";
	import { type Snippet } from "svelte";

	let {
		children = undefined,
		member,
		round = false,
		class: classNames,
		imageContainerClass,
		showMemberColor = true,
		...restProps
	}: {
		children?: Snippet;
		member?: MemberStatic;
		round?: boolean;
		class?: string;
		imageContainerClass?: string;
		showMemberColor?: boolean;
	} = $props();

	let memberImageUrl: string | undefined = $derived(member?.image);

	let showChildren = $state(false);
</script>

<svelte:window onclick={() => (showChildren = false)} />

<div
	class={`member-image${classNames ? " " + classNames : ""}`}
	style={showMemberColor
		? `--member-color:${member?.color || "transparent"}; --highlight-thickness: 1;`
		: ""}
>
	<div
		class={`image-container relative aspect-square flex items-center justify-center text-center overflow-hidden h-full${round ? " rounded-full" : ""}${imageContainerClass ? ` ${imageContainerClass}` : ""}`}
		onmouseenter={() => (showChildren = true)}
		onmouseleave={() => (showChildren = false)}
		onclick={(event) => {
			event.stopPropagation();
			showChildren = true;
		}}
		{...restProps}
	>
		{#if member && memberImageUrl}
			<img
				src={memberImageUrl}
				alt={t("{member.name}'s profile picture", member.name)}
				class="w-full h-full object-cover"
			/>
		{:else}
			<PersonIcon
				iconProps={{ class: "w-full h-full object-cover" }}
				class="w-full h-full opacity-70"
			/>
		{/if}

		{#if showChildren}
			{@render children?.()}
		{/if}
	</div>
</div>

<style lang="scss">
	:global .member-image {
		.image-container.rounded-full {
			border: 1px solid var(--member-color);
		}

		&:not(:has(.image-container.rounded-full)) {
			--thickness: calc(var(--highlight-thickness) * var(--spacing));
			--radius: var(--image-radius);

			position: relative;
			padding-left: calc(var(--thickness) * 3) !important;

			&:has(.image-container.rounded-md) {
				--image-radius: var(--radius-md);
			}
			&:has(.image-container.rounded-xl) {
				--image-radius: var(--radius-xl);
			}

			&::before {
				content: "";
				display: block;
				position: absolute;
				left: calc(var(--thickness));
				top: 50%;
				width: 0;
				height: calc(100% - var(--radius) * 2);
				transform: translateY(-50%);
				background: var(--member-color);
				border: calc(var(--thickness) / 2) solid var(--member-color);
				border-radius: var(--thickness);
			}
		}
	}
</style>
