<script lang="ts">
	import { sortBy } from "$lib/component-utils.js";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import { subscribeToModel } from "$lib/idb/entry-subscription.svelte";
	import { Block, Navbar, Searchbar, Sheet } from "konsta/svelte";
	import { Member, type MemberStatic } from "openselves-common/client";

	let {
		opened,
		onCancel,
		onSelect,
		showUnknownOption = false,
		excludedMembers = [],
		title = t("Select member"),
	}: {
		opened: boolean;
		onCancel: () => Promise<void> | void;
		onSelect: (member: MemberStatic | undefined) => Promise<void> | void;
		showUnknownOption?: boolean;
		excludedMembers?: MemberStatic[];
		title?: string;
	} = $props();

	let members = $derived.by(subscribeToModel(Member));
	let memberSearch: string = $state("");
	let selectableMembers = $derived(
		members.staticData
			.filter(
				(member) =>
					!member.isArchived &&
					!excludedMembers.find((excludedMember) => excludedMember.id === member.id) &&
					member.name.toLowerCase().includes(memberSearch.toLowerCase()),
			)
			.sort(sortBy((member) => member.name)),
	);
	let allOptions = $derived(
		showUnknownOption ? [undefined, ...selectableMembers] : selectableMembers,
	);
</script>

<Sheet
	class="pb-safe flex flex-col"
	style="height: calc(100vh - 72px)"
	{opened}
	onBackdropClick={onCancel}
>
	<Navbar {title} bgClass="bg-transparent">
		{#snippet subnavbar()}
			<Searchbar
				placeholder={t("Search by name...")}
				class="p-4 rounded-3xl"
				clearButton
				bind:value={memberSearch}
				onClear={() => (memberSearch = "")}
			/>
		{/snippet}
	</Navbar>
	<Block class="overflow-y-auto">
		{#each allOptions as member (member?.id)}
			<MemberCard {member} onClick={() => onSelect(member)} small />
		{/each}
	</Block>
</Sheet>
