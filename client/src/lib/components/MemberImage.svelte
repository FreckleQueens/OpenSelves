<script lang="ts">
	import PersonIcon from "$lib/components/icons/PersonIcon.svelte";
	import type { Member } from "openselves-common/db";
	import type { Snippet } from "svelte";

	let {
		children = undefined,
		member,
		class: classNames,
		...restProps
	}: { children?: Snippet; member: Omit<Member, "userId">; class?: string } = $props();

	let showChildren = $state(false);
</script>

<svelte:window onclick={() => (showChildren = false)} />

<div
	class={`${classNames ? classNames + " " : ""}aspect-square flex items-center justify-center text-center overflow-hidden`}
	onmouseenter={() => (showChildren = true)}
	onmouseleave={() => (showChildren = false)}
	onclick={(event) => {
		event.stopPropagation();
		showChildren = true;
	}}
	{...restProps}
>
	{#if member.image}
		<img
			src={member.image}
			alt={t("{member.name}'s profile picture", member.name)}
			class="w-full h-full object-contain"
		/>
	{:else}
		<PersonIcon
			iconProps={{ class: "w-full h-full object-contain" }}
			class="w-full h-full opacity-70"
		/>
	{/if}

	{#if showChildren}
		{@render children?.()}
	{/if}
</div>
