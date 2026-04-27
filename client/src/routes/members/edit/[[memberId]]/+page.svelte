<script lang="ts">
	import { PersistentStorage } from "$lib/PersistentStorage";
	import MemberImage from "$lib/components/MemberImage.svelte";
	import EditPage from "$lib/components/forms/EditPage.svelte";
	import EditPageDangerZone from "$lib/components/forms/EditPageDangerZone.svelte";
	import ArchiveInputIcon from "$lib/components/icons/ArchiveInputIcon.svelte";
	import DescriptionInputIcon from "$lib/components/icons/DescriptionInputIcon.svelte";
	import EditIcon from "$lib/components/icons/EditIcon.svelte";
	import ImageIcon from "$lib/components/icons/ImageIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import NameInputIcon from "$lib/components/icons/NameInputIcon.svelte";
	import PronounsInputIcon from "$lib/components/icons/PronounsInputIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import UploadIcon from "$lib/components/icons/UploadIcon.svelte";
	import type { FormValidationState } from "$lib/forms";
	import { IDB } from "$lib/idb";
	import { requireAuth } from "$lib/routing-utils";
	import isUrl from "is-url";
	import { Block, Button, List, ListInput, ListItem, Toggle } from "konsta/svelte";
	import type { Member } from "openselves-common/db";
	import { type Snippet, onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { isDataURI } from "validator";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	let mounted = $state(false);
	type MemberData = Omit<Member, "userId">;
	let member: MemberData = $state({
		id: "",
		name: "",
		pronouns: "",
		description: "",
		image: null,
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
	let editImageUrl = $state(false);
	let imageFiles: FileList | undefined = $state();
	let imageFileInputEl: HTMLInputElement | undefined = $state();
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

	$effect(() => {
		if (!imageFiles) {
			return;
		}

		const file = imageFiles.item(0);
		if (!file) {
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result?.toString() || "";
			if (result) {
				if (result.length <= 8192) {
					member.image = result;
					formState.errors["image"] = "";
				} else {
					formState.errors["image"] = t("This file is too big! (max 8kB)");
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

	const hasMemberChanged = () => JSON.stringify(member) !== JSON.stringify(originalMember);

	async function saveMember() {
		const userId = storage.getUserId();

		const image = member.image ? member.image : null;
		if (image) {
			if (image.startsWith("data:")) {
				if (!isDataURI(image)) {
					formState.errors["image"] = t("Image url must be a valid data uri");
					return false;
				}
			} else {
				let isValidUrl: boolean;
				try {
					new URL(image);
					isValidUrl = isUrl(image);
				} catch {
					isValidUrl = false;
				}

				if (!isValidUrl) {
					formState.errors["image"] = t("Image url must be a valid url");
					return false;
				}
			}
		}

		member = await idb.member.saveSynced(
			userId,
			{
				...member,
				image,
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
	<Block class={"flex flex-col items-stretch" + (activeTab !== "info" ? " hidden" : "")}>
		<MemberImage {member} class="w-6/12 self-center relative">
			<div class="absolute bottom-2 right-2" transition:fly={{ y: 50, duration: 150 }}>
				<Button
					id="edit-image-url-button"
					class="p-2"
					type="button"
					onclick={() => (editImageUrl = !editImageUrl)}
				>
					<EditIcon button />
				</Button>
			</div>
		</MemberImage>

		<List class={editImageUrl ? "" : "hidden"}>
			<ListInput
				type="url"
				name="image"
				label={t("Image url")}
				floatingLabel
				maxlength="8192"
				bind:value={member.image}
				error={formState.errors["image"] || ""}
			>
				{#snippet media()}
					<ImageIcon input />
				{/snippet}
			</ListInput>

			<li class="m-4 text-center">
				<Button
					inline
					tonal
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
		</List>
	</Block>

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
