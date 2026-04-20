<script lang="ts">
	import { PersistentStorage } from "$lib/PersistentStorage";
	import EditPage from "$lib/components/forms/EditPage.svelte";
	import EditPageDangerZone from "$lib/components/forms/EditPageDangerZone.svelte";
	import ArchiveInputIcon from "$lib/components/icons/ArchiveInputIcon.svelte";
	import DescriptionInputIcon from "$lib/components/icons/DescriptionInputIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import NameInputIcon from "$lib/components/icons/NameInputIcon.svelte";
	import PronounsInputIcon from "$lib/components/icons/PronounsInputIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import type { FormValidationState } from "$lib/forms";
	import { IDB } from "$lib/idb";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, List, ListInput, ListItem, Toggle } from "konsta/svelte";
	import type { Member } from "openselves-common/db";
	import { type Snippet, onMount } from "svelte";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	let mounted = $state(false);
	type MemberData = Omit<Member, "userId">;
	let member: MemberData = $state({
		id: "",
		name: "",
		pronouns: "",
		description: "",
		isArchived: false,
		archivedReason: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	let originalMember: MemberData | null = $state(null);
	let formState: FormValidationState = $state({
		errors: {},
		generalError: "",
	});
	let activeTab: "info" | "settings" = $state("info");
	let deleteRecordButton: Snippet | null = $state(null);

	requireAuth();
	const storage = PersistentStorage.getInstance();
	const idb = IDB.getInstance();

	onMount(async () => {
		if (params.memberId) {
			member = await idb.member.getByPrimaryKey(params.memberId);
		}
		originalMember = { ...member };
		mounted = true;
	});

	const hasMemberChanged = () => JSON.stringify(member) !== JSON.stringify(originalMember);

	async function saveMember() {
		const userId = storage.getUserId();
		member = await idb.member.saveSynced(
			userId,
			{
				...member,
			},
			!!member.id,
		);

		return true;
	}

	async function deleteMember() {
		const userId = storage.getUserId();
		await idb.member.deleteSynced(userId, [member.id]);
	}
</script>

<EditPage
	ready={mounted}
	thingName={t("member")}
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
	hasRecordChanged={hasMemberChanged}
	onSave={saveMember}
	onDelete={deleteMember}
	bind:formState
	bind:activeTab
	bind:deleteRecordButton
>
	<div class:hidden={activeTab !== "info"}>
		<List>
			<ListInput
				name="name"
				label={t("Name")}
				floatingLabel
				required
				bind:value={member.name}
				error={formState.errors["name"] || ""}
			>
				{#snippet media()}
					<NameInputIcon input />
				{/snippet}
			</ListInput>
			<ListInput
				name="pronouns"
				label={t("Pronouns")}
				floatingLabel
				bind:value={member.pronouns}
				error={formState.errors["pronouns"] || ""}
			>
				{#snippet media()}
					<PronounsInputIcon input />
				{/snippet}
			</ListInput>
			<ListInput
				name="description"
				label={t("Description")}
				floatingLabel
				type="textarea"
				autocomplete="off"
				inputClass="min-h-20"
				bind:value={member.description}
				error={formState.errors["description"] || ""}
			>
				{#snippet media()}
					<DescriptionInputIcon input />
				{/snippet}
			</ListInput>
		</List>
	</div>

	<div class:hidden={activeTab !== "settings"}>
		{#if member.id}
			<Block>
				<List>
					<ListItem label title={t("Archive member")}>
						{#snippet after()}
							<Toggle
								name="isArchived"
								checked={!!member.isArchived}
								onChange={() => (member.isArchived = !member.isArchived)}
							/>
						{/snippet}
					</ListItem>
					<div class:hidden={!member.isArchived}>
						<ListInput
							name="archivedReason"
							label={t("Archived reason")}
							floatingLabel
							type="textarea"
							autocomplete="off"
							inputClass="min-h-6"
							bind:value={member.archivedReason}
							error={formState.errors["archivedReason"] || ""}
						>
							{#snippet media()}
								<ArchiveInputIcon input />
							{/snippet}
						</ListInput>
					</div>
				</List>
			</Block>

			<EditPageDangerZone>
				{@render deleteRecordButton?.()}
			</EditPageDangerZone>
		{/if}
	</div>
</EditPage>
