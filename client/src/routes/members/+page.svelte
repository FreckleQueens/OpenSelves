<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import AppPage from "$lib/components/AppPage.svelte";
	import FabMenu from "$lib/components/FabMenu.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import FilterIcon from "$lib/components/icons/FilterIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import { IDB } from "$lib/idb";
	import { subscribeToModel } from "$lib/idb/component-utils";
	import { Storage } from "$lib/storage";
	import { Dialog, List, ListItem, Toggle } from "konsta/svelte";
	import { type Member } from "openselves-common/db";
	import { onMount } from "svelte";

	let members: {
		records: Member[];
	} = $state({
		records: [],
	});
	let showArchivedMembers = $state(false);
	let shownMembers: Member[] = $derived(
		members.records
			.filter((member) => showArchivedMembers || !member.isArchived)
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
	let showFilterDialog: boolean = $state(false);
	let pageContent: HTMLDivElement | undefined = $state();

	subscribeToModel(async () => {
		const idb = await IDB.getClient();
		return idb.member;
	}, members);

	onMount(async () => {
		const storage = await Storage.getStorage();
		showArchivedMembers = !!(await storage.get("showArchivedMembers"));
	});

	async function addMemberButtonOnClick() {
		await goto(resolve("/members/edit/"));
	}

	async function toggleShowArchivedMembers() {
		showArchivedMembers = !showArchivedMembers;
		const storage = await Storage.getStorage();
		await storage.set("showArchivedMembers", showArchivedMembers ? "on" : "");
	}
</script>

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

<AppPage title="" activeMenuItem={MenuItem.MEMBERS} bind:pageContent>
	<div class="p-4">
		{#each shownMembers as member (member.id)}
			<MemberCard {member} onClick={() => goto(resolve(`/members/edit/${member.id}`))} />
		{/each}
	</div>

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
			bind:pageContent
		/>
	{/snippet}
</AppPage>
