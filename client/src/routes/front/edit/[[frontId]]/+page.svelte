<script lang="ts">
	import MemberCard from "$lib/components/MemberCard.svelte";
	import DateTimeInput from "$lib/components/forms/DateTimeInput.svelte";
	import EditPage from "$lib/components/forms/EditPage.svelte";
	import EditPageDangerZone from "$lib/components/forms/EditPageDangerZone.svelte";
	import SelectMemberSheet from "$lib/components/forms/SelectMemberSheet.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import NoteIcon from "$lib/components/icons/NoteIcon.svelte";
	import PersonIcon from "$lib/components/icons/PersonIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import type { FormValidationState } from "$lib/forms";
	import { IDB } from "$lib/idb";
	import { subscribeToModel } from "$lib/idb/component-utils";
	import { Storage } from "$lib/storage";
	import { Block, Button, List, ListInput } from "konsta/svelte";
	import type { Front, Member } from "openselves-common/db";
	import { type Snippet, onMount } from "svelte";

	import type { PageProps } from "./$types";

	type FrontData = Omit<Front, "userId">;

	const { params }: PageProps = $props();

	let members: {
		loaded: boolean;
		records: Member[];
	} = $state({
		loaded: false,
		records: [],
	});
	let front: FrontData | null = $state(null);
	let frontMember: Member | null = $derived(
		front && members.loaded
			? members.records.find((member) => member.id === front?.memberId) || null
			: null,
	);
	let originalFront: FrontData | null = $state(null);

	let mounted = $state(false);
	let formState: FormValidationState = $state({
		errors: {},
		generalError: "",
	});
	let activeTab: "info" | "settings" = $state("info");
	let deleteRecordButton: Snippet | null = $state(null);
	let showSelectMemberSheet = $state(false);

	subscribeToModel(async () => {
		const idb = await IDB.getClient();
		return idb.member;
	}, members);

	onMount(async () => {
		if (!params.frontId) {
			throw new Error("frontId route param is required");
		}

		const idb = await IDB.getClient();
		front = await idb.front.getById(params.frontId);
		originalFront = { ...front };
		mounted = true;
	});

	const hasFrontChanged = () => JSON.stringify(front) !== JSON.stringify(originalFront);

	async function saveFront() {
		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const idb = await IDB.getClient();
		front = await idb.front.saveSynced(
			userId,
			{
				...front,
			},
			true,
		);

		return true;
	}

	async function deleteFront() {
		if (!front) {
			throw new Error("Front not loaded");
		}

		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const idb = await IDB.getClient();
		await idb.front.deleteSynced(userId, [front.id]);
	}
</script>

<EditPage
	ready={mounted}
	thingName={t("front")}
	tabs={[
		{
			id: "info",
			title: t("Info"),
			icon: InfoIcon,
		},
		{
			id: "settings",
			title: t("Settings"),
			icon: SettingsIcon,
		},
	]}
	hasRecordChanged={hasFrontChanged}
	onSave={saveFront}
	onDelete={deleteFront}
	bind:formState
	bind:activeTab
	bind:deleteRecordButton
>
	{#if front}
		<div class:hidden={activeTab !== "info"}>
			<Block>
				{#if frontMember}
					<MemberCard
						onClick={() => {
							showSelectMemberSheet = true;
						}}
						member={frontMember}
					/>
				{:else}
					Unknown member
					<Button
						onClick={() => {
							showSelectMemberSheet = true;
						}}
					>
						<PersonIcon button before />
						Select member
					</Button>
				{/if}
			</Block>

			<List>
				<DateTimeInput
					name="startedAt"
					max={new Date()}
					required
					bind:value={front.startedAt}
					onInput={(date) => {
						if (front && date) {
							front.startedAt = date;
						}
					}}
					error={formState.errors["startedAt"] || ""}
				/>
				<DateTimeInput
					name="endedAt"
					bind:min={front.startedAt}
					max={new Date()}
					clearButton
					inputClass="pr-8"
					bind:value={front.endedAt}
					onInput={(date) => {
						if (front) {
							front.endedAt = date;
						}
					}}
					error={formState.errors["endedAt"] || ""}
				/>
				<ListInput
					name="note"
					label={t("Note")}
					floatingLabel
					bind:value={front.note}
					error={formState.errors["note"] || ""}
				>
					{#snippet media()}
						<NoteIcon input />
					{/snippet}
				</ListInput>
			</List>
		</div>

		<div class:hidden={activeTab !== "settings"}>
			<EditPageDangerZone>
				{@render deleteRecordButton?.()}
			</EditPageDangerZone>
		</div>
	{/if}
</EditPage>

<SelectMemberSheet
	opened={showSelectMemberSheet}
	onCancel={() => {
		showSelectMemberSheet = false;
	}}
	onSelect={(member) => {
		if (front) front.memberId = member.id;
		showSelectMemberSheet = false;
	}}
	excludedMembers={frontMember ? [frontMember] : []}
/>
