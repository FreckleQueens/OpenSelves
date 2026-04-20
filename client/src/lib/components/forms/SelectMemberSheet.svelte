<script lang="ts">
	import MemberCard from "$lib/components/MemberCard.svelte";
	import { IDB } from "$lib/idb";
	import { subscribeToModel } from "$lib/idb/component-utils";
	import { Block, Navbar, Searchbar, Sheet } from "konsta/svelte";
	import type { Member } from "openselves-common/db";

	let {
		opened,
		onCancel,
		onSelect,
		excludedMembers = [],
		title = t("Select member"),
	}: {
		opened: boolean;
		onCancel: () => Promise<void> | void;
		onSelect: (member: Member) => Promise<void> | void;
		excludedMembers?: Member[];
		title?: string;
	} = $props();

	let members: { loaded?: boolean; records: Member[] } = $state({
		records: [],
	});
	let memberSearch: string = $state("");
	let selectableMembers = $derived(
		members.records
			.filter(
				(member) =>
					!member.isArchived &&
					!excludedMembers.find((excludedMember) => excludedMember.id === member.id) &&
					member.name.includes(memberSearch),
			)
			.sort((a, b) => {
				if (a.name < b.name) {
					return -1;
				}
				if (a.name > b.name) {
					return 1;
				}
				return 0;
			}),
	);

	subscribeToModel(IDB.getInstance().member, members);
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
		{#each selectableMembers as member (member.id)}
			<MemberCard {member} onClick={() => onSelect(member)} small />
		{/each}
	</Block>
</Sheet>
