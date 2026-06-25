<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { appState } from "$lib/appState.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import FabMenu from "$lib/components/FabMenu.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import FilterIcon from "$lib/components/icons/FilterIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import { IDB } from "$lib/idb";
	import { type SubscriptionState, sortBy, subscribeToModel } from "$lib/idb/component-utils";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, Dialog, List, ListItem, Toggle } from "konsta/svelte";
	import { type Front, type Member } from "openselves-common/db";
	import { onMount } from "svelte";

	let members: SubscriptionState<Member> = $state({
		records: [],
	});
	let fronts: SubscriptionState<Front> = $state({
		records: [],
	});
	let currentFronts = $derived(
		fronts.records
			.filter((front) => members.loaded && !front.endedAt)
			.map((front) => {
				const member = members.records.find((member) => member.id === front.memberId);
				if (!member) {
					throw new Error("Member not found for front " + front.id);
				}
				return {
					...front,
					member: member,
					frontingFor: Date.now() - front.startedAt.getTime(),
				};
			})
			.sort(sortBy((front) => front.member.name)),
	);
	let showArchivedMembers = $state(false);
	let shownMembers: Member[] = $derived(
		members.records
			.filter(
				(member) =>
					(showArchivedMembers || !member.isArchived) &&
					!currentFronts.find((front) => front.member.id === member.id),
			)
			.sort(sortBy((member) => member.name)),
	);
	let showFilterDialog: boolean = $state(false);
	let pageContent: HTMLDivElement | undefined = $state();

	requireAuth();
	const storage = PersistentStorage.getInstance();
	const idb = IDB.getInstance();
	subscribeToModel(idb.member, members);
	subscribeToModel(idb.front, fronts);

	onMount(async () => {
		if (!appState.isAuthenticated) {
			return;
		}

		showArchivedMembers = !!(await storage.get("showArchivedMembers"));
	});

	async function addMemberButtonOnClick() {
		await goto(resolve("/members/edit/"));
	}

	async function toggleShowArchivedMembers() {
		showArchivedMembers = !showArchivedMembers;
		await storage.set("showArchivedMembers", showArchivedMembers ? "on" : "");
	}
</script>

<AppPage title="" activeMenuItem={MenuItem.MEMBERS} bind:pageContent>
	<Block>
		{#each currentFronts as front (front.member.id)}
			<MemberCard
				member={front.member}
				onClick={() => goto(resolve(`/members/edit/${front.member.id}`))}
			/>
		{/each}

		{#each shownMembers as member (member.id)}
			<MemberCard {member} onClick={() => goto(resolve(`/members/edit/${member.id}`))} />
		{/each}
	</Block>

	{#snippet bottomNav()}
		<FabMenu
			menuItems={[
				{
					id: "create-member",
					icon: PlusIcon,
					action: addMemberButtonOnClick,
				},
				{
					id: "open-member-filters",
					icon: FilterIcon,
					action: () => {
						showFilterDialog = true;
					},
				},
			]}
			{pageContent}
		/>
	{/snippet}
</AppPage>

<Dialog opened={showFilterDialog} onBackdropClick={() => (showFilterDialog = false)}>
	{#snippet title()}
		Filter members
	{/snippet}
	<List nested>
		<ListItem label title={t("Show archived members")}>
			{#snippet after()}
				<Toggle checked={showArchivedMembers} onChange={toggleShowArchivedMembers} />
			{/snippet}
		</ListItem>
	</List>
</Dialog>
