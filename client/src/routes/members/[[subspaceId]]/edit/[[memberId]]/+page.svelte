<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import MemberImage from "$lib/components/MemberImage.svelte";
	import EditPage from "$lib/components/forms/EditPage.svelte";
	import EditPageDangerZone from "$lib/components/forms/EditPageDangerZone.svelte";
	import ArchiveInputIcon from "$lib/components/icons/ArchiveInputIcon.svelte";
	import ClearIcon from "$lib/components/icons/ClearIcon.svelte";
	import ColorInputIcon from "$lib/components/icons/ColorInputIcon.svelte";
	import DescriptionInputIcon from "$lib/components/icons/DescriptionInputIcon.svelte";
	import DismissIcon from "$lib/components/icons/DismissIcon.svelte";
	import DownloadIcon from "$lib/components/icons/DownloadIcon.svelte";
	import EditIcon from "$lib/components/icons/EditIcon.svelte";
	import ErrorIcon from "$lib/components/icons/ErrorIcon.svelte";
	import ImageIcon from "$lib/components/icons/ImageIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import NameInputIcon from "$lib/components/icons/NameInputIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import PronounsInputIcon from "$lib/components/icons/PronounsInputIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import UploadIcon from "$lib/components/icons/UploadIcon.svelte";
	import type { FormValidationState } from "$lib/forms";
	import { localeState } from "$lib/i18n/i18n";
	import { IDBStore } from "$lib/idb/IDBStore";
	import { proxyEntryDataModel } from "$lib/idb/entry-subscription.svelte.js";
	import { getMemberImageUrl } from "$lib/idb/model-utils.svelte";
	import { Profile } from "$lib/idb/profiles";
	import { requireCurrentProfile } from "$lib/routing-utils";
	import { filesize } from "filesize";
	import isUrl from "is-url";
	import { Block, Button, List, ListInput, ListItem, Toast, Toggle } from "konsta/svelte";
	import { OPENSELVES_NAMESPACE_ID } from "openselves-common";
	import { Member, type MemberStatic, Payload } from "openselves-common/client";
	import { ByteString, MAX_IN_DB_PAYLOAD_LENGTH, SubspaceId } from "openselves-common/willow";
	import { type Snippet } from "svelte";
	import { fly } from "svelte/transition";
	import { isDataURI } from "validator";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	// TODO: profileState = $derived.by(requireCurrentProfile())
	let profile: Profile | undefined = $state();
	let formState: FormValidationState = $state({
		errors: {},
		generalError: "",
	});
	let activeTab: "info" | "settings" = $state("info");
	let deleteRecordButton: Snippet | null = $state(null);

	let subspaceId: SubspaceId = $derived(
		params.subspaceId
			? SubspaceId.fromHex(params.subspaceId)
			: Profile.getCurrentProfile().defaultSubspace.subspaceId,
	);
	let memberLoaded = $state(false);
	let loadedMemberObj: Member | undefined = $state();
	let memberObj: Member = $derived(loadedMemberObj || new Member(subspaceId, {}));

	let member = $derived(proxyEntryDataModel(memberObj));

	let initialData = $state();
	let isDirty = $derived(JSON.stringify(member) !== JSON.stringify(initialData));
	$effect(() => {
		if (memberObj) {
			initialData = memberObj.data;
		}
	});

	// Image
	let imageFileInputEl: HTMLInputElement | undefined = $state();
	const memberState: { member?: MemberStatic } = $state({});
	$effect(() => {
		memberState.member = member;
	});
	let memberImageState = $derived.by(getMemberImageUrl(memberState));

	let showEditImageInput = $state(false);
	let isImageUrlInputMode = $derived(
		!memberImageState.url || !memberImageState.url.startsWith("blob:"),
	);
	let showRemoteImageErrorToast: boolean = $state(false);
	let saveRemoteImageError: string | undefined = $state();

	let memberImageUrlInput: string | undefined = $state();

	let imageFiles: FileList | undefined = $state();
	let selectedFile: File | null = $derived.by(() => {
		if (imageFiles) {
			const file = imageFiles.item(0);
			if (file) {
				const maxSizeForDataUrl = (MAX_IN_DB_PAYLOAD_LENGTH * 3) / 4;
				const maxFileSize = Math.max(
					(profile?.isSyncEnabled() && profile.api.status?.maxUploadSize) || 0,
					maxSizeForDataUrl,
				);
				if (file.size > maxFileSize) {
					formState.errors["image"] = t(
						"This file is too big! (max {file.size})",
						filesize(maxFileSize, {
							locale: localeState.locale || true,
						}),
					);
					return null;
				}

				return file;
			}
		}
		return null;
	});

	requireCurrentProfile().then((loadedProfile) => {
		if (loadedProfile) {
			profile = loadedProfile;
		}
	});
	const idbStore = IDBStore.getInstance(OPENSELVES_NAMESPACE_ID);

	$effect(() => {
		if (profile) {
			if (params.memberId) {
				idbStore.loadDataModel(Member, subspaceId, params.memberId).then((loadedMember) => {
					if (!loadedMember) {
						return goto(resolve("/members"));
					}
					loadedMemberObj = loadedMember;
					memberLoaded = true;
				});
			} else {
				memberLoaded = true;
			}
		}
	});

	$effect(() => {
		if (selectedFile || memberImageUrlInput !== undefined) {
			setImage(
				selectedFile ||
					(memberImageUrlInput ? ByteString.fromUtf8(memberImageUrlInput) : undefined),
			);
		}
	});

	async function saveMember() {
		if (!profile) {
			throw new Error("Current profile is undefined");
		}

		let image = member.image ? member.image : null;
		if (image && typeof image === "string" && image.startsWith("data:") && !isDataURI(image)) {
			formState.errors["image"] = t("Image url must be a valid data uri");
			return false;
		}

		await idbStore.area(memberObj.subspaceId).saveDataModel(memberObj, profile);
		return true;
	}

	async function deleteMember() {
		if (!profile) {
			throw new Error("Current profile is undefined");
		}

		await idbStore.ingest(
			[
				await memberObj.makePermanentDeleteEntry(
					profile.getSignDataForSubspaceId(memberObj.subspaceId),
				),
			],
			undefined,
		);
	}

	async function setImage(val: ByteString | Blob | undefined) {
		if (val) {
			const encodedImage = await Payload.encodeByteStringOrBlob(val);
			member.image = encodedImage.toBase64();
		} else {
			member.image = undefined;
			memberImageUrlInput = "";
			imageFiles = undefined;
		}
		formState.errors["image"] = "";
	}

	async function downloadRemoteImage() {
		if (!profile) {
			throw new Error("Profile not loaded");
		}

		const url = member.image;
		if (typeof url !== "string" || !isUrl(url)) {
			throw new Error("member image is not a url", { cause: url });
		}

		let result: Blob;
		try {
			const response = await fetch(url, {
				credentials: url.startsWith(profile.api.url) ? "include" : undefined,
			});
			if (!response.ok) {
				throw new Error("Got non-ok response.", {
					cause: {
						status: response.status,
						body: await response.text(),
					},
				});
			}
			result = await response.blob();
			console.log(response.ok, result);
		} catch (e) {
			console.log("Error while saving remote image", e);
			saveRemoteImageError = t("Image failed to download");
			showRemoteImageErrorToast = true;

			const linkEl = document.createElement("a");
			linkEl.href = url;
			linkEl.download = "";
			linkEl.target = "_blank";
			linkEl.click();

			return;
		}

		setImage(result);
	}
</script>

<EditPage
	ready={memberLoaded}
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
					onclick={() => (showEditImageInput = !showEditImageInput)}
				>
					<EditIcon button />
				</Button>
			</div>
		</MemberImage>

		<List class={showEditImageInput ? "" : "hidden"}>
			{@const disabled = !!(
				member.image &&
				typeof member.image === "string" &&
				isDataURI(member.image)
			)}
			{#if isImageUrlInputMode}
				<ListInput
					type="url"
					name="image"
					label={t("Image url")}
					floatingLabel
					maxlength={MAX_IN_DB_PAYLOAD_LENGTH.toString()}
					bind:value={memberImageUrlInput}
					error={formState.errors["image"] || ""}
					{disabled}
					class={disabled ? "hidden" : ""}
					clearButton={!!member.image}
					onClear={() => setImage(undefined)}
				>
					{#snippet media()}
						<ImageIcon input />
					{/snippet}
				</ListInput>
			{/if}

			<li class="m-4 text-center">
				<div class:hidden={!disabled} class="text-brand-red">
					{formState.errors["image"] || ""}
				</div>
				{#if !isImageUrlInputMode}
					<Button
						inline
						tonal
						class={"m-2" +
							(member.image || (member.image?.length || 0) > 0 ? "" : " hidden")}
						type="button"
						onclick={() => setImage(undefined)}
					>
						<ClearIcon button before />
						Remove image
					</Button>
				{/if}

				{#if member.image && typeof member.image === "string" && isUrl(member.image)}
					<Button inline tonal class="m-2" type="button" onclick={downloadRemoteImage}>
						<DownloadIcon button before />
						Make available offline
					</Button>
				{/if}

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

<Toast position="center" opened={showRemoteImageErrorToast}>
	<ErrorIcon before />
	<span class="flex-1 mr-2">{saveRemoteImageError}</span>

	<Button
		inline
		small
		clear
		rounded
		class="p-1"
		onclick={() => (showRemoteImageErrorToast = false)}
	>
		<DismissIcon button />
	</Button>
</Toast>
