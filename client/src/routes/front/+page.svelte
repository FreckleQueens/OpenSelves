<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import AppPage from "$lib/components/AppPage.svelte";
	import FabMenu from "$lib/components/FabMenu.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import DateTimeInput from "$lib/components/forms/DateTimeInput.svelte";
	import SelectMemberSheet from "$lib/components/forms/SelectMemberSheet.svelte";
	import AddNoteIcon from "$lib/components/icons/AddNoteIcon.svelte";
	import DateTimeInputIcon from "$lib/components/icons/DateTimeInputIcon.svelte";
	import DeleteSweepIcon from "$lib/components/icons/DeleteSweepIcon.svelte";
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
		List,
		ListInput,
		Preloader,
	} from "konsta/svelte";
	import type { Front, Member } from "openselves-common/db";
	import { onMount } from "svelte";

	import FrontTabbar from "./FrontTabbar.svelte";
	import { FrontTab } from "./tabs";

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
	let pageContent: HTMLDivElement | undefined = $state();
	let showMemberSelectSheet = $state(false);
	let showClearFrontDialog = $state(false);
	let addNoteToFrontId: string | undefined = $state();

	requireAuth();

	const storage = PersistentStorage.getInstance();
	const idb = IDB.getInstance();
	subscribeToModel(idb.member, members);
	subscribeToModel(idb.front, fronts);

	let selectMemberAction: "createFront" | "replaceFrontMember" | null = null;
	let replaceMemberFrontId: string | undefined = undefined;
	async function selectMember(member: Member) {
		if (selectMemberAction === "createFront") {
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
			await idb.front.saveSynced(storage.getUserId(), front);
			showMemberSelectSheet = false;
		} else if (selectMemberAction === "replaceFrontMember") {
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

<AppPage title="" bind:pageContent activeMenuItem={MenuItem.FRONT}>
	<BlockTitle medium>Currently fronting</BlockTitle>
	<Block id="current-fronting-members" class="pt-2 pb-2">
		{#each currentFronts as front (front.id)}
			{@const member = members.records.find((member) => member.id === front.memberId)}
			{#if member}
				<MemberCard
					{member}
					onClick={() => goto(resolve(`/members/edit/${front.memberId}`))}
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
			{/if}
		{:else}
			{#if !members.loaded || !fronts.loaded}
				<Preloader />
			{:else}
				<p class="no-front">No one is currently fronting.</p>
			{/if}
		{/each}
	</Block>

	{#snippet bottomNav()}
		<FabMenu
			menuItems={[
				{
					id: "add-front",
					icon: PlusIcon,
					action: () => {
						selectMemberAction = "createFront";
						showMemberSelectSheet = true;
					},
				},
				{
					id: "reset-front",
					icon: DeleteSweepIcon,
					action: () => {
						showClearFrontDialog = true;
					},
				},
			]}
			{pageContent}
		/>
		<FrontTabbar activeTab={FrontTab.CURRENT} />
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

<Dialog opened={showClearFrontDialog} onBackdropClick={() => (showClearFrontDialog = false)}>
	{#snippet title()}
		Clear front
	{/snippet}

	This will mark all front entries as ended.

	{#snippet buttons()}
		<Button onclick={() => (showClearFrontDialog = false)}>Cancel</Button>
		<Button class="k-color-brand-red" onclick={() => endAllFronts()}>
			<DeleteSweepIcon button before />
			Confirm
		</Button>
	{/snippet}
</Dialog>
