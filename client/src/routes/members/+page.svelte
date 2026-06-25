<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { appState } from "$lib/appState.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import FabMenu from "$lib/components/FabMenu.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import DateTimeInput from "$lib/components/forms/DateTimeInput.svelte";
	import SelectMemberSheet from "$lib/components/forms/SelectMemberSheet.svelte";
	import AddNoteIcon from "$lib/components/icons/AddNoteIcon.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DateTimeInputIcon from "$lib/components/icons/DateTimeInputIcon.svelte";
	import DeleteSweepIcon from "$lib/components/icons/DeleteSweepIcon.svelte";
	import FilterIcon from "$lib/components/icons/FilterIcon.svelte";
	import JoinFrontIcon from "$lib/components/icons/JoinFrontIcon.svelte";
	import LeaveFrontIcon from "$lib/components/icons/LeaveFrontIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import ReplaceMemberIcon from "$lib/components/icons/ReplaceMemberIcon.svelte";
	import { localeState } from "$lib/i18n/i18n";
	import { IDB } from "$lib/idb";
	import { type SubscriptionState, sortBy, subscribeToModel } from "$lib/idb/component-utils";
	import { requireAuth } from "$lib/routing-utils";
	import humanizeDuration from "humanize-duration";
	import {
		Block,
		BlockTitle,
		Button,
		Chip,
		Dialog,
		DialogButton,
		List,
		ListInput,
		ListItem,
		Toggle,
	} from "konsta/svelte";
	import { type Front, type Member } from "openselves-common/db";
	import { onMount } from "svelte";

	import MembersTabbar from "./MembersTabbar.svelte";
	import { MembersTab } from "./tabs.ts";

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
	let frontInputMap: Record<string, () => void> = $state({});
	let showMemberSelectSheet = $state(false);
	let showClearFrontDialog = $state(false);
	let addNoteToFrontId: string | undefined = $state();

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

	let selectMemberAction: "replaceFrontMember" | null = null;
	let replaceMemberFrontId: string | undefined = undefined;
	async function selectMember(member: Member) {
		if (selectMemberAction === "replaceFrontMember") {
			await idb.front.saveSynced(
				storage.getUserId(),
				{
					id: replaceMemberFrontId || "",
					memberId: member.id,
				},
				true,
			);
			showMemberSelectSheet = false;
		} else {
			throw new Error("No select member action selected");
		}
	}

	async function startFront(memberId: string) {
		const now = new Date();
		const front: Omit<Front, "userId"> = {
			id: "",
			memberId: memberId,
			startedAt: now,
			endedAt: null,
			note: null,
			createdAt: now,
			updatedAt: now,
		};
		await idb.front.saveSynced(storage.getUserId(), front);
		showMemberSelectSheet = false;
	}

	async function endFront(frontId: string) {
		await idb.front.saveSynced(
			storage.getUserId(),
			{
				id: frontId,
				endedAt: new Date(),
			},
			true,
		);
	}

	async function endAllFronts() {
		showClearFrontDialog = false;
		for (const front of [...currentFronts]) {
			await endFront(front.id);
		}
	}

	async function setFrontNote(frontId: string, value: string) {
		addNoteToFrontId = frontId;
		await idb.front.saveSynced(
			storage.getUserId(),
			{
				id: frontId,
				note: value ? value : null,
			},
			true,
		);
	}

	async function setFrontStartDate(frontId: string, value: Date) {
		await idb.front.saveSynced(
			storage.getUserId(),
			{
				id: frontId,
				startedAt: value,
			},
			true,
		);
	}

	onMount(() => {
		const interval = window.setInterval(() => {
			fronts.records = [...fronts.records]; // Re-calculate frontingFor
		}, 1000);
		return () => window.clearInterval(interval);
	});
</script>

<AppPage title="" activeMenuItem={MenuItem.MEMBERS} bind:pageContent>
	<BlockTitle>Currently fronting</BlockTitle>
	<Block id="current-fronting-members">
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
		{#each currentFronts as front (front.member.id)}
			<MemberCard
				member={front.member}
				onClick={() => goto(resolve(`/members/edit/${front.member.id}`))}
				actions={[
					{
						id: "end-front",
						icon: LeaveFrontIcon,
						onClick: () => endFront(front.id),
					},
				]}
				secondaryActions={[
					{
						id: "change-start-date",
						icon: DateTimeInputIcon,
						onClick: () => {
							frontInputMap[front.id]?.();
						},
					},
					{
						id: "replace-member",
						icon: ReplaceMemberIcon,
						onClick: () => {
							selectMemberAction = "replaceFrontMember";
							replaceMemberFrontId = front.id;
							showMemberSelectSheet = true;
						},
					},
					{
						id: "add-note",
						icon: AddNoteIcon,
						onClick: () => {
							selectMemberAction = "replaceFrontMember";
							addNoteToFrontId = front.id;
						},
					},
				]}
			>
				{#snippet chips()}
					<Chip>
						<time datetime={front.startedAt.toISOString()}>
							{humanizeDuration(front.frontingFor, {
								language: localeState.locale || undefined,
								round: true,
								fallbacks: ["en"],
								largest: 2,
							})}
						</time>
					</Chip>
				{/snippet}

				{#snippet footer()}
					{#if front.note || front.id === addNoteToFrontId}
						<List class="m-0 mt-2">
							{@const initialNote = front.note}
							<ListInput
								name="note"
								placeholder={t("Note")}
								floatingLabel
								onclick={(ev) => ev.stopPropagation()}
								onInput={(ev) => setFrontNote(front.id, ev.target?.value)}
								value={initialNote}
							/>
						</List>
					{/if}

					<DateTimeInput
						hidden
						name="startedAt"
						onInput={(date) => {
							if (date) {
								return setFrontStartDate(front.id, date);
							}
						}}
						max={new Date()}
						value={front.startedAt}
						bind:open={frontInputMap[front.id]}
						onclick={(ev) => ev.stopPropagation()}
					/>
				{/snippet}
			</MemberCard>
		{:else}
			<p class="no-front">No one is currently fronting.</p>
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

<SelectMemberSheet
	title={t("Select fronter")}
	opened={showMemberSelectSheet}
	onCancel={() => {
		showMemberSelectSheet = false;
	}}
	onSelect={selectMember}
	excludedMembers={currentFronts.map((front) => front.member)}
/>

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
