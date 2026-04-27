<script lang="ts">
	import PersonIcon from "$lib/components/icons/PersonIcon.svelte";
	import type { Member } from "openselves-common/db";

	let {
		member,
		class: classNames,
		...restProps
	}: { member: Omit<Member, "userId">; class?: string } = $props();
</script>

<div
	class={`${classNames ? classNames + " " : ""}aspect-square flex items-center justify-center text-center overflow-hidden`}
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
</div>
