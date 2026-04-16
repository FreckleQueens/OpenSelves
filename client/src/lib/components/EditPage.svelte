<script lang="ts" generics="TabId extends string">
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import DeleteIcon from "$lib/components/icons/DeleteIcon.svelte";
	import DiscardIcon from "$lib/components/icons/DiscardIcon.svelte";
	import SaveIcon from "$lib/components/icons/SaveIcon.svelte";
	import { Button, Dialog, DialogButton, Link, Segmented, SegmentedButton } from "konsta/svelte";
	import { type Component, type Snippet, onMount } from "svelte";

	let {
		children,
		thingName,
		tabs = undefined,
		hasRecordChanged,
		onSave,
		onDelete,
		onDiscard,
		ready = true,
		activeTab = $bindable(),
		// eslint-disable-next-line no-useless-assignment
		deleteRecordButton = $bindable(),
	}: {
		children?: Snippet;
		thingName: string;
		tabs?: {
			id: TabId;
			title: string;
			icon: Component;
		}[];
		hasRecordChanged: () => Promise<boolean> | boolean;
		onSave: () => Promise<boolean> | boolean;
		onDelete: () => Promise<void> | void;
		onDiscard?: () => Promise<void> | void;
		ready?: boolean;
		activeTab?: TabId;
		deleteRecordButton?: Snippet | null;
	} = $props();

	let showSaveConfirmDialog = $state(false);
	let showDiscardChangesDialog = $state(false);
	let openDeleteMemberDialog = $state(false);

	onMount(() => {
		deleteRecordButton = _deleteRecordButton;
	});

	async function backLinkOnClick(e: Event) {
		e.preventDefault();
		if (await hasRecordChanged()) {
			showSaveConfirmDialog = true;
		} else {
			await discardChanges();
		}
	}

	async function saveChanges() {
		if (hasRecordChanged()) {
			if (await onSave()) {
				history.back();
			}
		} else {
			history.back();
		}
	}

	async function discardChanges() {
		await onDiscard?.();
		history.back();
	}

	async function deleteRecord() {
		await onDelete();
		history.back();
	}
</script>

<AppPage title="" loading={!ready} showMenu={false}>
	{#snippet navbarLeft()}
		<BackLink onClick={backLinkOnClick} />
		{#if hasRecordChanged()}
			<Link onClick={() => (showDiscardChangesDialog = true)}>
				<DiscardIcon button />
			</Link>
		{/if}
	{/snippet}
	{#snippet navbarRight()}
		<Link id="save-record-button" onClick={saveChanges}>
			<SaveIcon button />
		</Link>
	{/snippet}

	{#snippet subnavbar()}
		<Segmented class="p-0">
			{#each tabs as tab (tab.id)}
				<SegmentedButton
					id={tab.id + "-tab-button"}
					active={activeTab === tab.id}
					onClick={() => (activeTab = tab.id)}
				>
					{@const Comp = tab.icon}
					<Comp button before />
					{tab.title}
				</SegmentedButton>
			{/each}
		</Segmented>
	{/snippet}

	{@render children?.()}
</AppPage>

<Dialog opened={showSaveConfirmDialog} onBackdropClick={() => (showSaveConfirmDialog = false)}>
	{#snippet title()}
		Save changes?
	{/snippet}

	{#snippet buttons()}
		<DialogButton onClick={() => (showSaveConfirmDialog = false)}>Cancel</DialogButton>
		<DialogButton strong onClick={saveChanges}>
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
		{t("Delete {thingName}", thingName)}
	{/snippet}

	{t(
		"Are you sure you want to delete this {thingName}? This action cannot be reverted.",
		thingName,
	)}

	{#snippet buttons()}
		<DialogButton onClick={() => (openDeleteMemberDialog = false)}>Cancel</DialogButton>
		<DialogButton
			id="delete-record-confirm-button"
			strong
			onClick={deleteRecord}
			class="k-color-brand-red"
		>
			<DeleteIcon button before />
			Delete
		</DialogButton>
	{/snippet}
</Dialog>

{#snippet _deleteRecordButton()}
	<Button
		id="delete-record-button"
		onClick={() => {
			openDeleteMemberDialog = true;
		}}
		class="k-color-brand-red"
		type="button"
	>
		<DeleteIcon button before />
		{t("Delete {thingName} (irreversible)", thingName)}
	</Button>
{/snippet}
