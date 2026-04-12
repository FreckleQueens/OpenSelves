<script lang="ts">
	import { MenuItem } from "$lib";
	import AppPage from "$lib/components/AppPage.svelte";
	import FabMenu from "$lib/components/FabMenu.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import DeleteSweepIcon from "$lib/components/icons/DeleteSweepIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import { IDB } from "$lib/idb";
	import { subscribeToModel } from "$lib/idb/component-utils";
	import { Storage } from "$lib/storage";
	import { Block, BlockTitle, Preloader, Sheet } from "konsta/svelte";
	import type { Front, Member } from "openselves-common/db";

	let members: { loaded?: boolean; records: Member[] } = $state({
		records: [],
	});
	let fronts: { loaded?: boolean; records: Front[] } = $state({
		records: [],
	});
	let currentFronts = $derived(
		fronts.records
			.filter((front) => !front.endedAt)
			.map((front) => {
				const member = members.records.find((member) => member.id === front.memberId);
				if (!member) {
					throw new Error("Member not found for front " + front.id);
				}
				return { ...front, member: member };
			})
			.sort((a, b) => {
				if (a.member.name < b.member.name) {
					return -1;
				}
				if (a.member.name > b.member.name) {
					return 1;
				}
				return 0;
			}),
	);
	let selectableMembers = $derived(
		members.records
			.filter(
				(member) =>
					!member.isArchived &&
					!currentFronts.find((front) => front.memberId === member.id),
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
	let pageContent: HTMLDivElement | undefined = $state();
	let showMemberSelectSheet = $state(false);

	subscribeToModel(async () => {
		const idb = await IDB.getClient();
		return idb.member;
	}, members);
	subscribeToModel(async () => {
		const idb = await IDB.getClient();
		return idb.front;
	}, fronts);

	async function selectMember(member: Member) {
		const storage = await Storage.getStorage();
		const idb = await IDB.getClient();

		const now = new Date();
		const front: Omit<Front, "userId"> = {
			id: "",
			memberId: member.id,
			startedAt: now,
			endedAt: null,
			note: null,
			createdAt: now,
			updatedAt: now,
		};
		await idb.front.saveSynced(storage.getKey(), front);
		showMemberSelectSheet = false;
	}
</script>

<AppPage title="" bind:pageContent activeMenuItem={MenuItem.FRONT}>
	<FabMenu
		menuItems={[
			{
				id: "add-front",
				icon: PlusIcon,
				action: () => {
					showMemberSelectSheet = true;
				},
			},
			{
				id: "reset-front",
				icon: DeleteSweepIcon,
				action: () => {},
			},
		]}
		bind:pageContent
	/>

	<BlockTitle medium>Currently fronting</BlockTitle>
	<Block class="pt-2 pb-2">
		{#each currentFronts as front (front.id)}
			{@const member = members.records.find((member) => member.id === front.memberId)}
			{#if member}
				<MemberCard {member} onClick={() => {}} />
			{/if}
		{:else}
			{#if !members.loaded || !fronts.loaded}
				<Preloader />
			{:else}
				<p class="no-front">No one is currently fronting.</p>
			{/if}
		{/each}
	</Block>
</AppPage>

<Sheet
	class="pb-safe flex flex-col"
	style="max-height: calc(100vh - 72px)"
	opened={showMemberSelectSheet}
	onBackdropClick={() => (showMemberSelectSheet = false)}
>
	<BlockTitle large>Select fronter</BlockTitle>
	<Block class="overflow-scroll">
		{#each selectableMembers as member (member.id)}
			<MemberCard {member} onClick={() => selectMember(member)} small />
		{/each}
	</Block>
</Sheet>
