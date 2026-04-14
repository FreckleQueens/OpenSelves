<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import AppPage from "$lib/components/AppPage.svelte";
	import FabMenu from "$lib/components/FabMenu.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import SelectMemberSheet from "$lib/components/SelectMemberSheet.svelte";
	import AddNoteIcon from "$lib/components/icons/AddNoteIcon.svelte";
	import DateTimeInputIcon from "$lib/components/icons/DateTimeInputIcon.svelte";
	import DeleteSweepIcon from "$lib/components/icons/DeleteSweepIcon.svelte";
	import LeaveFrontIcon from "$lib/components/icons/LeaveFrontIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import ReplaceMemberIcon from "$lib/components/icons/ReplaceMemberIcon.svelte";
	import { localeState } from "$lib/i18n/i18n";
	import { IDB } from "$lib/idb";
	import { subscribeToModel } from "$lib/idb/component-utils";
	import { Storage } from "$lib/storage";
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

	let members: { loaded?: boolean; records: Member[] } = $state({
		records: [],
	});
	let fronts: { loaded?: boolean; records: Front[] } = $state({
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
	let frontInputMap: Record<string, HTMLInputElement> = $state({});
	let pageContent: HTMLDivElement | undefined = $state();
	let showMemberSelectSheet = $state(false);
	let showClearFrontDialog = $state(false);
	let addNoteToFrontId: string | undefined = $state();

	subscribeToModel(async () => {
		const idb = await IDB.getClient();
		return idb.member;
	}, members);
	subscribeToModel(async () => {
		const idb = await IDB.getClient();
		return idb.front;
	}, fronts);

	let selectMemberAction: "createFront" | "replaceFrontMember" | null = null;
	let replaceMemberFrontId: string | undefined = undefined;
	async function selectMember(member: Member) {
		const storage = await Storage.getStorage();
		const idb = await IDB.getClient();

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
			await idb.front.saveSynced(storage.getKey(), front);
			showMemberSelectSheet = false;
		} else if (selectMemberAction === "replaceFrontMember") {
			await idb.front.saveSynced(
				storage.getKey(),
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
		const storage = await Storage.getStorage();
		const idb = await IDB.getClient();

		await idb.front.saveSynced(
			storage.getKey(),
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
		const storage = await Storage.getStorage();
		const idb = await IDB.getClient();
		await idb.front.saveSynced(
			storage.getKey(),
			{
				id: frontId,
				note: value ? value : null,
			},
			true,
		);
	}

	async function setFrontStartDate(frontId: string, value: Date) {
		const storage = await Storage.getStorage();
		const idb = await IDB.getClient();
		await idb.front.saveSynced(
			storage.getKey(),
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
		bind:pageContent
	/>

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

					{#snippet secondaryActions()}
						<div class="mt-2 inline">
							<Button
								class="p-2"
								inline
								tonal
								raised
								onclick={(ev) => {
									ev.stopPropagation();
									// In Firefox desktop, datetime-local currently fails to display a time picker
									// See https://bugzilla.mozilla.org/show_bug.cgi?id=1726107
									const userAgent = navigator.userAgent.toLowerCase();
									if (
										userAgent.includes("firefox") &&
										!userAgent.includes("mobile") &&
										!userAgent.includes("android")
									) {
										frontInputMap[front.id]?.classList.remove("hidden");
										frontInputMap[front.id]?.focus();
									}
									frontInputMap[front.id]?.showPicker();
								}}
							>
								<DateTimeInputIcon button />
							</Button>
							<Button
								class="p-2"
								inline
								tonal
								raised
								onclick={(ev) => {
									ev.stopPropagation();
									selectMemberAction = "replaceFrontMember";
									replaceMemberFrontId = front.id;
									showMemberSelectSheet = true;
								}}
							>
								<ReplaceMemberIcon button />
							</Button>
							<Button
								class="p-2"
								inline
								tonal
								raised
								onclick={(ev) => {
									ev.stopPropagation();
									addNoteToFrontId = front.id;
								}}
							>
								<AddNoteIcon button />
							</Button>
						</div>
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
						<!-- onblur is part of the firefox desktop datetime picker bug workaround -->
						<input
							class="hidden"
							type="datetime-local"
							name="startedAt"
							onclick={(ev) => ev.stopPropagation()}
							oninput={(ev) => {
								const value = ev.currentTarget?.value;
								if (!value) return;
								return setFrontStartDate(front.id, new Date(value));
							}}
							onblur={(ev) => ev.currentTarget?.classList.add("hidden")}
							value={new Date(
								front.startedAt.getTime() -
									front.startedAt.getTimezoneOffset() * 60 * 1000,
							)
								.toISOString()
								.slice(0, 16)}
							bind:this={frontInputMap[front.id]}
							max={new Date(Date.now() - new Date().getTimezoneOffset() * 60 * 1000)
								.toISOString()
								.slice(0, 16)}
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
