<script lang="ts">
	import { DEFAULT_API_URL } from "$lib/api.svelte";
	import EditPage from "$lib/components/forms/EditPage.svelte";
	import EditPageDangerZone from "$lib/components/forms/EditPageDangerZone.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import NameInputIcon from "$lib/components/icons/NameInputIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import SyncIcon from "$lib/components/icons/SyncIcon.svelte";
	import SyncOffIcon from "$lib/components/icons/SyncOffIcon.svelte";
	import type { FormValidationState } from "$lib/forms";
	import { Profile, type ProfileData, profilesState } from "$lib/idb/profiles";
	import { createId } from "@paralleldrive/cuid2";
	import { Block, List, ListInput, ListItem, Toggle } from "konsta/svelte";
	import { type Snippet, onMount } from "svelte";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	let isCreate = $state(true);
	let apiUrl: string | undefined = $state(DEFAULT_API_URL);
	// svelte-ignore state_referenced_locally
	let initialData: ProfileData = $state({
		id: createId(),
		name: "",
		api: {
			url: apiUrl,
		},
	});
	// svelte-ignore state_referenced_locally
	let profileData: ProfileData = $state({ ...initialData });
	let isDirty = $derived(
		JSON.stringify(profileData) !== JSON.stringify(initialData) ||
			apiUrl !== initialData.api?.url,
	);
	let formState: FormValidationState = $state({
		errors: {},
		generalError: "",
	});
	let isSyncEnabled: boolean = $derived(typeof apiUrl === "string");
	let activeTab: "info" | "settings" = $state("info");
	let deleteRecordButton: Snippet | undefined = $state();

	onMount(async () => {
		if (params.profileId) {
			isCreate = false;
			const profileToEdit = profilesState.data.find(
				(profile) => profile.id === params.profileId,
			);
			if (!profileToEdit) {
				throw new Error("Profile not found for id " + profileData.id);
			}
			profileData = { ...profileToEdit };
			initialData = { ...profileData };
			apiUrl = initialData.api?.url;
		}
	});

	function toggleEnableSync() {
		if (isSyncEnabled) {
			apiUrl = undefined;
		} else {
			apiUrl = DEFAULT_API_URL;
		}
	}

	async function onSave() {
		const data = {
			id: profileData.id,
			name: profileData.name,
			api: apiUrl
				? {
						url: apiUrl,
					}
				: undefined,
		};
		if (isCreate) {
			await Profile.create(data);
		} else {
			await Profile.update(data);
		}
		return true;
	}

	async function onDelete() {
		await Profile.wipeProfileData(profileData.id);
	}
</script>

<EditPage
	pageTitle={isCreate
		? t("Create a new profile")
		: t("Edit profile {name}", profileData.name || "")}
	thingName={t("Profile")}
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
	{onSave}
	{onDelete}
	bind:formState
	bind:deleteRecordButton
	bind:activeTab
>
	<div class:hidden={activeTab !== "info"}>
		<Block>
			<List>
				<ListInput
					name="name"
					label={t("Profile name")}
					placeholder={t("Alice's system")}
					required
					bind:value={profileData.name}
					bind:error={formState.errors["name"]}
				>
					{#snippet media()}
						<NameInputIcon input />
					{/snippet}
				</ListInput>

				<ListItem label title={t("Enable sync (recommended)")}>
					{#snippet media()}
						<Toggle
							id="enable-sync-checkbox"
							checked={isSyncEnabled}
							onChange={toggleEnableSync}
						/>
					{/snippet}
					{#snippet after()}
						{#if isSyncEnabled}
							<SyncIcon input before class="text-brand-green" />
						{:else}
							<SyncOffIcon input before />
						{/if}
					{/snippet}
				</ListItem>
			</List>
		</Block>
	</div>

	<div class:hidden={activeTab !== "settings"}>
		{#if isSyncEnabled}
			<Block>
				<List>
					<ListInput
						name="api-url"
						type="url"
						label={t("Sync server url")}
						placeholder="https://api.openselves.org"
						required
						bind:value={apiUrl}
						bind:error={formState.errors["api-url"]}
					>
						{#snippet media()}
							<SyncIcon input />
						{/snippet}
					</ListInput>
				</List>
			</Block>
		{/if}

		<Block>
			<EditPageDangerZone>
				{@render deleteRecordButton?.()}
			</EditPageDangerZone>
		</Block>
	</div>
</EditPage>
