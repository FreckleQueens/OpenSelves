<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import AppPage from "$lib/AppPage.svelte";
	import { IDB } from "$lib/idb";
	import type { IDBSyncedModelEvent } from "$lib/idb/IDBSyncedModel";
	import { Storage } from "$lib/storage";
	import Icon from "@iconify/svelte";
	import { Card, Dialog, Fab, Link, List, ListItem, Toggle, useTheme } from "konsta/svelte";
	import { type Member } from "openselves-common/db";
	import { onDestroy, onMount } from "svelte";

	let members: Member[] = $state([]);
	let showArchivedMembers = $state(false);
	let shownMembers: Member[] = $derived(
		members
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

	let membersSubscription: (event: IDBSyncedModelEvent<Member>) => void;
	onMount(async () => {
		const storage = await Storage.getStorage();
		showArchivedMembers = !!(await storage.get("showArchivedMembers"));

		const userId = storage.getKey();
		const idb = await IDB.getClient();
		membersSubscription = idb.member.subscribe((event) => {
			for (const member of event.savedRecords) {
				const index = members.findIndex((localMember) => localMember.id === member.id);
				if (index >= 0) {
					members[index] = member;
				} else {
					members.push(member);
				}
			}

			for (const id of event.deletedRecordIds) {
				const index = members.findIndex((localMember) => localMember.id === id);
				if (index >= 0) {
					members.splice(index, 1);
				}
			}
		});
		members = await idb.member.getByField("userId", userId);
	});

	onDestroy(async () => {
		const idb = await IDB.getClient();
		idb.member.unsubscribe(membersSubscription);
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
		<ListItem label title="Show archived members">
			{#snippet after()}
				<Toggle checked={showArchivedMembers} onChange={toggleShowArchivedMembers} />
			{/snippet}
		</ListItem>
	</List>
</Dialog>

<AppPage title="" activeMenuItem={MenuItem.MEMBERS}>
	<div class="absolute right-safe-4 bottom-safe-4 z-20 flex flex-col items-center">
		<Fab
			id="open-member-filters-button"
			class="k-color-brand-secondary size-10 mb-3"
			onclick={() => (showFilterDialog = true)}
		>
			{#snippet icon()}
				<Icon
					icon={useTheme() === "ios" ? "heroicons-outline:filter" : "ic:round-filter-alt"}
					class="text-2xl"
				/>
			{/snippet}
		</Fab>
		<Fab
			id="create-member-button"
			class="k-color-brand-primary"
			onclick={addMemberButtonOnClick}
		>
			{#snippet icon()}
				<Icon icon={useTheme() === "ios" ? "f7:plus" : "ic:round-plus"} class="text-2xl" />
			{/snippet}
		</Fab>
	</div>

	{#each shownMembers as member (member.id)}
		<Link href={`/members/edit/${member.id}`} class="block">
			<Card raised>
				<div class="flex items-center">
					<Icon
						icon={useTheme() === "ios" ? "f7:person" : "ic:round-person"}
						class="text-4xl mr-2"
					/>
					<div class="flex-1">
						<p>{member.name}</p>
						<p class="opacity-70">{member.pronouns}</p>
					</div>
					{#if member.isArchived}
						<Icon
							icon={useTheme() === "ios" ? "f7:archivebox" : "ic:round-archive"}
							class="text-4xl opacity-75"
						/>
					{/if}
				</div>
			</Card>
		</Link>
	{/each}
</AppPage>
