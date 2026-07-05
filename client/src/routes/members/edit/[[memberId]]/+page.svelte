<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { apiState } from "$lib/api.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import MemberImage from "$lib/components/MemberImage.svelte";
	import EditPage from "$lib/components/forms/EditPage.svelte";
	import EditPageDangerZone from "$lib/components/forms/EditPageDangerZone.svelte";
	import ArchiveInputIcon from "$lib/components/icons/ArchiveInputIcon.svelte";
	import ClearIcon from "$lib/components/icons/ClearIcon.svelte";
	import ColorInputIcon from "$lib/components/icons/ColorInputIcon.svelte";
	import DescriptionInputIcon from "$lib/components/icons/DescriptionInputIcon.svelte";
	import EditIcon from "$lib/components/icons/EditIcon.svelte";
	import ImageIcon from "$lib/components/icons/ImageIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import NameInputIcon from "$lib/components/icons/NameInputIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import PronounsInputIcon from "$lib/components/icons/PronounsInputIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import UploadIcon from "$lib/components/icons/UploadIcon.svelte";
	import type { FormValidationState } from "$lib/forms";
	import { localeState } from "$lib/i18n/i18n";
	import { IDBSubStore } from "$lib/idb/IDBSubStore";
	import { proxyEntryDataModel } from "$lib/idb/entry-subscription.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import { filesize } from "filesize";
	import { Block, Button, List, ListInput, ListItem, Toggle } from "konsta/svelte";
	import { Member, type MemberStatic } from "openselves-common/client";
	import { MAX_IN_DB_PAYLOAD_LENGTH, OPENSELVES_NAMESPACE_ID } from "openselves-common/willow";
	import { type Snippet, onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { isDataURI } from "validator";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	const storage = PersistentStorage.getInstance();

	let mounted = $state(false);
	let memberObj: Member = $state(new Member(storage.getUserId(), {}));
	// svelte-ignore state_referenced_locally
	let initialData = memberObj.data;
	let member: MemberStatic = $derived(proxyEntryDataModel(memberObj));
	let formState: FormValidationState = $state({
		errors: {},
		generalError: "",
	});
	let activeTab: "info" | "settings" = $state("info");
	let editImageUrl = $state(false);
	let imageFiles: FileList | undefined = $state();
	let imageFileInputEl: HTMLInputElement | undefined = $state();
	let deleteRecordButton: Snippet | null = $state(null);

	requireAuth();
	const idbStore = new IDBSubStore(OPENSELVES_NAMESPACE_ID, storage.getUserId());

	onMount(async () => {
		if (params.memberId) {
			const loadedMember = await idbStore.loadDataModel(Member, params.memberId);
			if (!loadedMember) {
				return goto(resolve("/members"));
			}
			memberObj = loadedMember;
			initialData = loadedMember.data;
		}
		mounted = true;
	});

	$effect(() => {
		if (!imageFiles) {
			return;
		}

		const file = imageFiles.item(0);
		if (!file) {
			return;
		}

		const maxSizeForDataUrl = (MAX_IN_DB_PAYLOAD_LENGTH * 3) / 4;
		const maxFileSize = Math.max(apiState.status?.maxUploadSize || 0, maxSizeForDataUrl);
		if (file.size > maxFileSize) {
			formState.errors["image"] = t(
				"This file is too big! (max {file.size})",
				filesize(maxFileSize, {
					locale: localeState.locale || true,
				}),
			);
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result?.toString() || "";
			if (result) {
				formState.errors["image"] = "";
				if (result.length <= maxFileSize) {
					member.image = result;
				} else {
					formState.errors["image"] = t(
						"This file is too big! (max {file.size})",
						filesize(maxFileSize, {
							locale: localeState.locale || true,
						}),
					);
				}
			} else {
				formState.errors["image"] = t("Error while loading file {file.name}", file.name);
			}
		};
		reader.onerror = () => {
			formState.errors["image"] = t("Error while loading file {file.name}", file.name);
		};
		reader.readAsDataURL(file);
	});

	function isDirty() {
		return JSON.stringify(member) !== JSON.stringify(initialData);
	}

	async function saveMember() {
		let image = member.image ? member.image : null;
		if (image && image.startsWith("data:") && !isDataURI(image)) {
			formState.errors["image"] = t("Image url must be a valid data uri");
			return false;
		}

		await idbStore.saveDataModel(memberObj);
		return true;
	}

	async function deleteMember() {
		await idbStore.ingest(
			[(await memberObj.makePermanentDeleteEntry()).entryWithPayload],
			undefined,
		);
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
	{isDirty}
	onSave={saveMember}
	onDelete={deleteMember}
	bind:formState
	bind:activeTab
	bind:deleteRecordButton
>
	{#snippet pageTitle()}
		<MemberCard {member} small inline />
	{/snippet}

	<Block class={"flex flex-col items-stretch" + (activeTab !== "info" ? " hidden" : "")}>
		<MemberImage
			{member}
			class="w-6/12 self-center relative"
			imageContainerClass="rounded-xl"
			showMemberColor={false}
		>
			<div class="absolute bottom-2 right-2" transition:fly={{ y: 50, duration: 150 }}>
				<Button
					raised
					id="edit-image-url-button"
					class="p-2"
					type="button"
					onclick={() => (editImageUrl = !editImageUrl)}
				>
					<EditIcon button />
				</Button>
			</div>
		</MemberImage>

		<!-- TODO: add a button to convert an http(s) url to a data uri -->
		<!-- TODO: add a warning for users to convert their (api)/attachment.+ urls to data uris -->
		<List class={editImageUrl ? "" : "hidden"}>
			{@const disabled = !!(member.image && isDataURI(member.image))}
			<ListInput
				type="url"
				name="image"
				label={t("Image url")}
				floatingLabel
				maxlength={MAX_IN_DB_PAYLOAD_LENGTH.toString()}
				bind:value={member.image}
				error={formState.errors["image"] || ""}
				{disabled}
				class={disabled ? "hidden" : ""}
			>
				{#snippet media()}
					<ImageIcon input />
				{/snippet}
			</ListInput>

			<li class="m-4 text-center">
				<div class:hidden={!disabled} class="text-brand-red">
					{formState.errors["image"] || ""}
				</div>
				<Button
					inline
					tonal
					class={"m-2" + ((member.image?.length || 0) > 0 ? "" : " hidden")}
					type="button"
					onclick={() => {
						member.image = undefined;
						formState.errors["image"] = "";
					}}
				>
					<ClearIcon button before />
					Remove image
				</Button>

				<Button
					inline
					tonal
					class="m-2"
					type="button"
					onclick={() => {
						imageFileInputEl?.click();
					}}
				>
					<UploadIcon button before />
					Load from file
				</Button>

				<input
					bind:this={imageFileInputEl}
					type="file"
					name="_image_file"
					accept="image/*"
					bind:files={imageFiles}
					class="hidden"
				/>
			</li>
		</List>

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

			{#if member.color}
				<ListInput
					name="color"
					label={t("Color")}
					type="color"
					bind:value={member.color}
					error={formState.errors["color"] || ""}
					clearButton
					onClear={() => (member.color = undefined)}
				>
					{#snippet media()}
						<ColorInputIcon input />
					{/snippet}
				</ListInput>
			{:else}
				<input type="hidden" name="color" value={member.color} />
				<ListItem class="text-center">
					<Button inline tonal type="button" onclick={() => (member.color = "#aaa")}>
						<ColorInputIcon secondary={PlusIcon} button before />
						Add a color
					</Button>
				</ListItem>
			{/if}
		</List>
	</Block>

	<div class:hidden={activeTab !== "settings"}>
		{#if member.id}
			<List strongIos inset class="my-8">
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

			<EditPageDangerZone>
				{@render deleteRecordButton?.()}
			</EditPageDangerZone>
		{/if}
	</div>
</EditPage>
