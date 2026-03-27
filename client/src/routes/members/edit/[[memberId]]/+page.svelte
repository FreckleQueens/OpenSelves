<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import AppPage from "$lib/AppPage.svelte";
	import { IDB } from "$lib/idb";
	import { Storage } from "$lib/storage";
	import Icon from "@iconify/svelte";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		Link,
		List,
		ListInput,
		ListItem,
		Segmented,
		SegmentedButton,
		Toggle,
		useTheme,
	} from "konsta/svelte";
	import type { Member } from "openselves-common/db";
	import { onMount } from "svelte";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	let member: Member = $state({
		id: "",
		userId: "",
		name: "",
		pronouns: "",
		description: "",
		createdAt: new Date(),
		updatedAt: new Date(),
		isArchived: false,
		archivedReason: null,
	});
	let originalMember: Member | null = $state(null);

	let mounted = $state(false);
	onMount(async () => {
		const idb = await IDB.getClient();
		if (params.memberId) {
			member = await idb.member.getById(params.memberId);
		}
		originalMember = { ...member };
		mounted = true;
	});

	enum Tab {
		INFO,
		SETTINGS,
	}

	let activeTab = $state(Tab.INFO);
	const tabs: Record<
		Tab,
		{
			title: string;
			iosIcon: string;
			materialIcon: string;
		}
	> = {
		[Tab.INFO]: {
			title: "Info",
			iosIcon: "f7:info-circle",
			materialIcon: "ic:round-info",
		},
		[Tab.SETTINGS]: {
			title: "Settings",
			iosIcon: "f7:ellipsis",
			materialIcon: "ic:round-settings",
		},
	};

	async function formOnSubmit(e?: SubmitEvent) {
		e?.preventDefault();
		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const idb = await IDB.getClient();
		member = await idb.member.save({
			...member,
			userId,
		});

		await goto(resolve("/members"));
	}

	let showSaveConfirmDialog = $state(false);
	const hasMemberChanged = () => JSON.stringify(member) !== JSON.stringify(originalMember);

	async function backLinkOnClick(e: Event) {
		e.preventDefault();
		if (hasMemberChanged()) {
			showSaveConfirmDialog = true;
		} else {
			discardChanges();
		}
	}

	let showDiscardChangesDialog = $state(false);

	function discardChanges() {
		history.back();
	}

	let openDeleteMemberDialog = $state(false);

	async function deleteMember() {
		const idb = await IDB.getClient();
		await idb.member.delete(member.id);
		await goto(resolve("/members"));
	}
</script>

<Dialog opened={showSaveConfirmDialog} onBackdropClick={() => (showSaveConfirmDialog = false)}>
	{#snippet title()}
		Save changes?
	{/snippet}

	{#snippet buttons()}
		<DialogButton onClick={() => (showSaveConfirmDialog = false)}>Cancel</DialogButton>
		<DialogButton strong onClick={formOnSubmit}>
			<Icon
				icon={useTheme() === "ios" ? "f7:floppy-disk" : "ic:round-save"}
				class="text-2xl mr-2"
			/>
			Save
		</DialogButton>
	{/snippet}
</Dialog>

<Dialog
	opened={showDiscardChangesDialog}
	onBackdropClick={() => (showDiscardChangesDialog = false)}
>
	{#snippet title()}
		Discard changes?
	{/snippet}

	{#snippet buttons()}
		<DialogButton onClick={() => (showDiscardChangesDialog = false)}>Cancel</DialogButton>
		<DialogButton strong onClick={discardChanges} class="k-color-brand-red">
			<Icon
				icon={useTheme() === "ios" ? "f7:xmark-circle" : "ic:round-cancel"}
				class="text-2xl mr-2"
			/>
			Discard
		</DialogButton>
	{/snippet}
</Dialog>

<Dialog opened={openDeleteMemberDialog} onBackdropClick={() => (openDeleteMemberDialog = false)}>
	{#snippet title()}
		Delete member
	{/snippet}

	Are you sure you want to delete this member? This action cannot be reverted.

	{#snippet buttons()}
		<DialogButton onClick={() => (openDeleteMemberDialog = false)}>Cancel</DialogButton>
		<DialogButton strong onClick={deleteMember} class="k-color-brand-red">
			<Icon
				icon={useTheme() === "ios" ? "f7:trash" : "ic:round-delete"}
				class="text-2xl mr-2"
			/>
			Delete
		</DialogButton>
	{/snippet}
</Dialog>

<AppPage title="" loading={!mounted} showMenu={false}>
	{#snippet navbarLeft()}
		<Link onClick={backLinkOnClick}>
			<Icon
				icon={useTheme() === "ios" ? "f7:arrow-left" : "ic:round-arrow-back"}
				class="text-2xl"
			/>
		</Link>
		{#if hasMemberChanged()}
			<Link onClick={() => (showDiscardChangesDialog = true)}>
				<Icon
					icon={useTheme() === "ios" ? "f7:xmark-circle" : "ic:round-cancel"}
					class="text-2xl"
				/>
			</Link>
		{/if}
	{/snippet}
	{#snippet navbarRight()}
		<Link onClick={formOnSubmit}>
			<Icon
				icon={useTheme() === "ios" ? "f7:floppy-disk" : "ic:round-save"}
				class="text-2xl"
			/>
		</Link>
	{/snippet}

	{#snippet subnavbar()}
		<Segmented class="p-0">
			{#each Object.entries(tabs) as [key, tab] (key)}
				<SegmentedButton
					active={activeTab === parseInt(key)}
					onClick={() => (activeTab = parseInt(key))}
				>
					<Icon
						icon={useTheme() === "ios" ? tab.iosIcon : tab.materialIcon}
						class="text-2xl mr-1"
					/>
					{tab.title}
				</SegmentedButton>
			{/each}
		</Segmented>
	{/snippet}

	<form onsubmit={formOnSubmit}>
		<div class:hidden={activeTab !== Tab.INFO}>
			<List>
				<ListInput name="name" label="Name" floatingLabel required bind:value={member.name}>
					{#snippet media()}
						<Icon
							icon={useTheme() === "ios"
								? "f7:square-pencil"
								: "ic:round-drive-file-rename-outline"}
							class="text-2xl"
						/>
					{/snippet}
				</ListInput>
				<ListInput
					name="pronouns"
					label="Pronouns"
					floatingLabel
					bind:value={member.pronouns}
				>
					{#snippet media()}
						<Icon icon="heroicons:slash-20-solid" class="text-2xl" />
					{/snippet}
				</ListInput>
				<ListInput
					name="description"
					label="Description"
					floatingLabel
					type="textarea"
					autocomplete="off"
					inputClass="min-h-20"
					bind:value={member.description}
				>
					{#snippet media()}
						<Icon
							icon={useTheme() === "ios" ? "f7:doc-text" : "ic:round-description"}
							class="text-2xl"
						/>
					{/snippet}
				</ListInput>
			</List>
		</div>

		<div class:hidden={activeTab !== Tab.SETTINGS}>
			{#if member.id}
				<Block>
					<List>
						<ListItem label title="Archive member">
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
								label="Archived reason"
								floatingLabel
								type="textarea"
								autocomplete="off"
								inputClass="min-h-6"
								bind:value={member.archivedReason}
							>
								{#snippet media()}
									<Icon
										icon={useTheme() === "ios"
											? "f7:gobackward"
											: "ic:round-history"}
										class="text-2xl"
									/>
								{/snippet}
							</ListInput>
						</div>
					</List>
				</Block>

				<BlockTitle class="text-brand-red">
					<p class="flex items-center border-b border-b-brand-red flex-1">
						<Icon
							icon={useTheme() === "ios"
								? "f7:exclamationmark-triangle"
								: "ic:round-warning"}
							class="text-2xl mr-1"
						/>
						Danger zone
					</p>
				</BlockTitle>
				<Block>
					<Button
						onClick={() => {
							openDeleteMemberDialog = true;
						}}
						class="k-color-brand-red"
						type="button"
					>
						<Icon
							icon={useTheme() === "ios" ? "f7:trash" : "ic:round-delete"}
							class="text-2xl mr-1"
						/>
						Delete member (irreversible)
					</Button>
				</Block>
			{/if}
		</div>
	</form>
</AppPage>
