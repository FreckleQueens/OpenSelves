<script lang="ts">
	import { PersistentStorage } from "$lib/PersistentStorage";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import DateTimeInput from "$lib/components/forms/DateTimeInput.svelte";
	import EditPage from "$lib/components/forms/EditPage.svelte";
	import EditPageDangerZone from "$lib/components/forms/EditPageDangerZone.svelte";
	import SelectMemberSheet from "$lib/components/forms/SelectMemberSheet.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import NoteIcon from "$lib/components/icons/NoteIcon.svelte";
	import ReplaceMemberIcon from "$lib/components/icons/ReplaceMemberIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import type { FormValidationState } from "$lib/forms";
	import { IDBStore } from "$lib/idb/IDBStore";
	import { proxyEntryDataModel, subscribeToModel } from "$lib/idb/entry-subscription.svelte";
	import { UserProfile } from "$lib/idb/local-profiles/UserProfile";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, Button, List, ListInput } from "konsta/svelte";
	import { Front, type FrontStatic, Member, type MemberStatic } from "openselves-common/client";
	import { OPENSELVES_NAMESPACE_ID } from "openselves-common/willow";
	import { type Snippet, onMount } from "svelte";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	let members = $derived.by(subscribeToModel(Member));
	let frontObj: Front | undefined = $state(undefined);
	let initialData: FrontStatic | undefined = undefined;
	let front: FrontStatic | undefined = $derived(
		frontObj ? proxyEntryDataModel<Front>(frontObj) : undefined,
	);
	let isDirty = $derived(JSON.stringify(front) !== JSON.stringify(initialData));
	let frontMember: MemberStatic | undefined = $derived(
		members.staticData.find((member) => member.id === front?.memberId) || undefined,
	);

	let mounted = $state(false);
	let formState: FormValidationState = $state({
		errors: {},
		generalError: "",
	});
	let activeTab: "info" | "settings" = $state("info");
	let deleteRecordButton: Snippet | null = $state(null);
	let showSelectMemberSheet = $state(false);

	requireAuth();
	const storage = PersistentStorage.getInstance();
	let userProfile: UserProfile;
	const idbStore = IDBStore.getInstance(OPENSELVES_NAMESPACE_ID);

	onMount(async () => {
		if (!params.frontId) {
			throw new Error("frontId route param is required");
		}

		userProfile = UserProfile.of(storage.getUserId());

		frontObj = await idbStore.loadDataModel(
			Front,
			userProfile.ownSubspace.subspaceId,
			params.frontId,
		);
		initialData = frontObj?.data;
		mounted = true;
	});

	async function saveFront() {
		if (!frontObj) {
			throw new Error("Front not loaded");
		}
		await idbStore.area(userProfile.ownSubspace.subspaceId).saveDataModel(frontObj);
		return true;
	}

	async function deleteFront() {
		if (!frontObj) {
			throw new Error("Front not loaded");
		}

		await idbStore.ingest([(await frontObj.makePermanentDeleteEntry()).entryWithPayload]);
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
	{isDirty}
	onSave={saveFront}
	onDelete={deleteFront}
	bind:formState
	bind:activeTab
	bind:deleteRecordButton
>
	{#if front}
		<div class:hidden={activeTab !== "info"}>
			<Block>
				<MemberCard
					onClick={() => {
						showSelectMemberSheet = true;
					}}
					member={frontMember || undefined}
				/>

				<Button
					tonal
					class="w-max m-auto"
					onclick={(ev) => {
						ev.preventDefault();
						showSelectMemberSheet = true;
					}}
				>
					<ReplaceMemberIcon button before />
					Swap member
				</Button>
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
					min={front.startedAt}
					max={new Date()}
					clearButton
					inputClass="pr-8"
					bind:value={front.endedAt}
					onInput={(date: Date | null) => {
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
		if (front) front.memberId = member?.id || null;
		showSelectMemberSheet = false;
	}}
	showUnknownOption
	excludedMembers={frontMember ? [frontMember] : []}
/>
