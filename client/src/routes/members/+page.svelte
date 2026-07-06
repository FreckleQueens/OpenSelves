<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { appState } from "$lib/appState.svelte";
	import { sortBy } from "$lib/component-utils.js";
	import AppPage from "$lib/components/AppPage.svelte";
	import FabMenu from "$lib/components/FabMenu.svelte";
	import FrontNote from "$lib/components/FrontNote.svelte";
	import FrontTimeFrontedFor from "$lib/components/FrontTimeFrontedFor.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import AddNoteIcon from "$lib/components/icons/AddNoteIcon.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DeleteSweepIcon from "$lib/components/icons/DeleteSweepIcon.svelte";
	import EditIcon from "$lib/components/icons/EditIcon.svelte";
	import FilterIcon from "$lib/components/icons/FilterIcon.svelte";
	import JoinFrontIcon from "$lib/components/icons/JoinFrontIcon.svelte";
	import LeaveFrontIcon from "$lib/components/icons/LeaveFrontIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import SearchIcon from "$lib/components/icons/SearchIcon.svelte";
	import { IDBSubStore } from "$lib/idb/IDBSubStore";
	import { subscribeToModel } from "$lib/idb/entry-subscription.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		Link,
		List,
		ListItem,
		Searchbar,
		Toggle,
	} from "konsta/svelte";
	import { Front, Member, type MemberStatic } from "openselves-common/client";
	import { OPENSELVES_NAMESPACE_ID } from "openselves-common/willow";
	import { onMount } from "svelte";

	import MembersTabbar from "./MembersTabbar.svelte";
	import { MembersTab } from "./tabs.ts";

	let members = $derived.by(subscribeToModel(Member));
	let fronts = $derived.by(subscribeToModel(Front));

	let showSearchbar: boolean = $state(false);
	let memberSearch: string = $state("");

	let currentFronts = $derived(
		fronts.staticData
			.filter((front) => !front.endedAt)
			.map((front) => {
				const member = members.staticData.find((member) => member.id === front.memberId);
				return {
					...front,
					member,
					memberName: member?.name || t("Unknown"),
				};
			})
			.filter((front) => front.memberName.toLowerCase().includes(memberSearch.toLowerCase()))
			.sort(sortBy((front) => front.memberName)),
	);
	let showClearFrontDialog = $state(false);
	let addNoteToFrontId: string | undefined = $state();

	let showArchivedMembers = $state(false);
	let shownMembers: MemberStatic[] = $derived(
		members.staticData
			.filter(
				(member) =>
					(showArchivedMembers || !member.isArchived) &&
					!currentFronts.find((front) => front.member && front.member.id === member.id) &&
					member.name.toLowerCase().includes(memberSearch.toLowerCase()),
			)
			.sort(sortBy((member) => member.name)),
	);
	let showFilterDialog: boolean = $state(false);
	let pageContent: HTMLDivElement | undefined = $state();

	requireAuth();
	const storage = PersistentStorage.getInstance();
	let store: IDBSubStore | undefined;

	onMount(async () => {
		if (!appState.isAuthenticated) {
			return;
		}
		store = new IDBSubStore(OPENSELVES_NAMESPACE_ID, storage.getUserId());

		showArchivedMembers = !!(await storage.get("showArchivedMembers"));
	});

	async function addMemberButtonOnClick() {
		await goto(resolve("/members/edit/"));
	}

	async function toggleShowArchivedMembers() {
		showArchivedMembers = !showArchivedMembers;
		await storage.set("showArchivedMembers", showArchivedMembers ? "on" : "");
	}

	async function startFront(memberId: string | null) {
		if (!store) {
			return;
		}

		const front = new Front(storage.getUserId(), {
			memberId: memberId,
		});
		await store.saveDataModel(front);
	}

	async function endFront(frontId: string) {
		if (!store) {
			return;
		}

		const front = fronts.dataModels.find((front) => front.get("id") === frontId);
		if (!front) {
			throw new Error("Front not found for id " + frontId);
		}
		front.set("endedAt", new Date());
		await store.saveDataModel(front);
	}

	async function endAllFronts() {
		showClearFrontDialog = false;
		for (const front of [...currentFronts]) {
			await endFront(front.id);
		}
	}

	async function setFrontNote(frontId: string, value: string) {
		if (!store) {
			return;
		}

		addNoteToFrontId = frontId;
		const front = fronts.dataModels.find((front) => front.get("id") === frontId);
		if (!front) {
			throw new Error("Front not found for id " + frontId);
		}
		front.set("note", value ? value : undefined);
		await store.saveDataModel(front);
	}
</script>

{#snippet searchbar()}
	<Searchbar
		placeholder={t("Search by name...")}
		class="p-4 rounded-3xl"
		clearButton
		bind:value={memberSearch}
		onClear={() => (memberSearch = "")}
	/>
{/snippet}

<AppPage
	title=""
	activeMenuItem={MenuItem.MEMBERS}
	bind:pageContent
	subnavbar={showSearchbar ? searchbar : undefined}
>
	<BlockTitle>Currently fronting</BlockTitle>
	<Block id="current-fronting-members">
		{#if currentFronts.length > 1}
			<div>
				<Button
					id="reset-front-button"
					onclick={() => {
						showClearFrontDialog = true;
					}}
					inline
					rounded
					clear
					class="k-color-brand-red"
				>
					<DeleteSweepIcon button before /> Clear front
				</Button>
			</div>
		{/if}

		{#each currentFronts as front (front.id)}
			<MemberCard
				member={front.member}
				onClick={() => {
					if (front.member) return goto(resolve(`/members/edit/${front.member.id}`));
				}}
				actions={[
					{
						id: "end-front",
						icon: LeaveFrontIcon,
						onClick: () => endFront(front.id),
					},
				]}
				secondaryActions={[
					{
						id: "add-note",
						icon: AddNoteIcon,
						onClick: () => {
							addNoteToFrontId = front.id;
						},
					},
					{
						id: "edit",
						icon: EditIcon,
						onClick: () => goto(resolve(`/members/front/edit/${front.id}`)),
					},
				]}
			>
				{#snippet chips()}
					<FrontTimeFrontedFor {front} />
				{/snippet}

				{#snippet footer()}
					{#if front.note || front.id === addNoteToFrontId}
						<FrontNote {front} {setFrontNote} />
					{/if}
				{/snippet}
			</MemberCard>
		{:else}
			{#if !memberSearch}
				<p class="no-front">No one is currently fronting.</p>
			{/if}
		{/each}
	</Block>

	<BlockTitle>Not fronting</BlockTitle>
	<Block id="not-fronting-members">
		{#each shownMembers as member (member.id)}
			<MemberCard
				{member}
				onClick={() => goto(resolve(`/members/edit/${member.id}`))}
				actions={[
					{
						id: "start-front",
						icon: JoinFrontIcon,
						onClick: () => startFront(member.id),
					},
				]}
			/>
		{/each}
	</Block>

	{#snippet navbarRight()}
		<Link onclick={() => (showSearchbar = !showSearchbar)}>
			<SearchIcon button />
		</Link>
	{/snippet}

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
		<MembersTabbar activeTab={MembersTab.CURRENT} />
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

<Dialog opened={showClearFrontDialog} onBackdropClick={() => (showClearFrontDialog = false)}>
	{#snippet title()}
		<span class="flex items-center">
			<DangerIcon before />
			Clear front
		</span>
	{/snippet}

	This will mark all front entries as ended.

	{#snippet buttons()}
		<DialogButton onclick={() => (showClearFrontDialog = false)}>Cancel</DialogButton>
		<DialogButton strong class="k-color-brand-red" onclick={() => endAllFronts()}>
			<DeleteSweepIcon button before />
			Confirm
		</DialogButton>
	{/snippet}
</Dialog>
