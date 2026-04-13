<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import ArchiveInputIcon from "$lib/components/icons/ArchiveInputIcon.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DeleteIcon from "$lib/components/icons/DeleteIcon.svelte";
	import DescriptionInputIcon from "$lib/components/icons/DescriptionInputIcon.svelte";
	import DiscardIcon from "$lib/components/icons/DiscardIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import NameInputIcon from "$lib/components/icons/NameInputIcon.svelte";
	import PronounsInputIcon from "$lib/components/icons/PronounsInputIcon.svelte";
	import SaveIcon from "$lib/components/icons/SaveIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import { IDB } from "$lib/idb";
	import { Storage } from "$lib/storage";
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
	} from "konsta/svelte";
	import type { Member } from "openselves-common/db";
	import { type Component, onMount } from "svelte";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

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
			buttonId: string;
			title: string;
			icon: Component;
		}
	> = {
		[Tab.INFO]: {
			buttonId: "info",
			title: t("Info"),
			icon: InfoIcon,
		},
		[Tab.SETTINGS]: {
			buttonId: "settings",
			title: t("Settings"),
			icon: SettingsIcon,
		},
	};

	async function formOnSubmit(e?: SubmitEvent) {
		e?.preventDefault();
		if (hasMemberChanged()) {
			const storage = await Storage.getStorage();
			const userId = storage.getKey();
			const idb = await IDB.getClient();
			member = await idb.member.saveSynced(
				userId,
				{
					...member,
				},
				!!member.id,
			);
		}

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
		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const idb = await IDB.getClient();
		await idb.member.deleteSynced(userId, [member.id]);
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
			<SaveIcon button before />
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
			<DiscardIcon button before />
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
		<DialogButton
			id="delete-member-confirm-button"
			strong
			onClick={deleteMember}
			class="k-color-brand-red"
		>
			<DeleteIcon button before />
			Delete
		</DialogButton>
	{/snippet}
</Dialog>

<AppPage title="" loading={!mounted} showMenu={false}>
	{#snippet navbarLeft()}
		<BackLink onClick={backLinkOnClick} />
		{#if hasMemberChanged()}
			<Link onClick={() => (showDiscardChangesDialog = true)}>
				<DiscardIcon button />
			</Link>
		{/if}
	{/snippet}
	{#snippet navbarRight()}
		<Link id="save-member-button" onClick={formOnSubmit}>
			<SaveIcon button />
		</Link>
	{/snippet}

	{#snippet subnavbar()}
		<Segmented class="p-0">
			{#each Object.entries(tabs) as [key, tab] (key)}
				<SegmentedButton
					id={tab.buttonId + "-tab-button"}
					active={activeTab === parseInt(key)}
					onClick={() => (activeTab = parseInt(key))}
				>
					{@const Comp = tab.icon}
					<Comp button before />
					{tab.title}
				</SegmentedButton>
			{/each}
		</Segmented>
	{/snippet}

	<form onsubmit={formOnSubmit}>
		<div class:hidden={activeTab !== Tab.INFO}>
			<List>
				<ListInput
					name="name"
					label={t("Name")}
					floatingLabel
					required
					bind:value={member.name}
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
				>
					{#snippet media()}
						<DescriptionInputIcon input />
					{/snippet}
				</ListInput>
			</List>
		</div>

		<div class:hidden={activeTab !== Tab.SETTINGS}>
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
							>
								{#snippet media()}
									<ArchiveInputIcon input />
								{/snippet}
							</ListInput>
						</div>
					</List>
				</Block>

				<BlockTitle class="text-brand-red">
					<p class="flex items-center border-b flex-1">
						<DangerIcon class="text-xl mr-1" />
						Danger zone
					</p>
				</BlockTitle>
				<Block>
					<Button
						id="delete-member-button"
						onClick={() => {
							openDeleteMemberDialog = true;
						}}
						class="k-color-brand-red"
						type="button"
					>
						<DeleteIcon button before />
						Delete member (irreversible)
					</Button>
				</Block>
			{/if}
		</div>
	</form>
</AppPage>
