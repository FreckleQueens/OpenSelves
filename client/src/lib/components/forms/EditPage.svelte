<script lang="ts" generics="TabId extends string">
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import FormFields from "$lib/components/forms/FormFields.svelte";
	import DeleteIcon from "$lib/components/icons/DeleteIcon.svelte";
	import DiscardIcon from "$lib/components/icons/DiscardIcon.svelte";
	import SaveIcon from "$lib/components/icons/SaveIcon.svelte";
	import type { FormValidationState } from "$lib/forms";
	import { Button, Dialog, DialogButton, Link, Segmented, SegmentedButton } from "konsta/svelte";
	import { type Component, type Snippet, onMount } from "svelte";

	let {
		children,
		pageTitle = "",
		thingName,
		tabs = undefined,
		isDirty,
		onSave,
		onDelete,
		onDiscard,
		ready = true,
		formState = $bindable(),
		activeTab = $bindable(),
		// eslint-disable-next-line no-useless-assignment
		deleteRecordButton = $bindable(),
	}: {
		children?: Snippet;
		pageTitle?: string | Snippet;
		thingName: string;
		tabs?: {
			id: TabId;
			title: string;
			icon: Component;
		}[];
		isDirty: () => Promise<boolean> | boolean;
		onSave: () => Promise<boolean> | boolean;
		onDelete: () => Promise<void> | void;
		onDiscard?: () => Promise<void> | void;
		ready?: boolean;
		formState: FormValidationState;
		activeTab?: TabId;
		deleteRecordButton?: Snippet | null;
	} = $props();

	let form: HTMLFormElement | null = $state(null);
	let showSaveConfirmDialog = $state(false);
	let showDiscardChangesDialog = $state(false);
	let openDeleteMemberDialog = $state(false);

	onMount(() => {
		deleteRecordButton = _deleteRecordButton;
	});

	async function backLinkOnClick(e: Event) {
		e.preventDefault();
		if (await isDirty()) {
			showSaveConfirmDialog = true;
		} else {
			await discardChanges();
		}
	}

	async function submitForm(event?: SubmitEvent) {
		event?.preventDefault();
		if (form?.checkValidity()) {
			await saveChanges();
		}
	}

	async function saveChanges() {
		if (isDirty()) {
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

<AppPage title={pageTitle} loading={!ready} showMenu={false}>
	{#snippet navbarLeft()}
		<BackLink onClick={backLinkOnClick} />
		{#if isDirty()}
			<Link onClick={() => (showDiscardChangesDialog = true)}>
				<DiscardIcon button />
			</Link>
		{/if}
	{/snippet}
	{#snippet navbarRight()}
		<Link id="save-record-button" onClick={() => submitForm()}>
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

	<form bind:this={form} onsubmit={submitForm}>
		<FormFields bind:formState>
			{@render children?.()}
		</FormFields>
	</form>
</AppPage>

<Dialog opened={showSaveConfirmDialog} onBackdropClick={() => (showSaveConfirmDialog = false)}>
	{#snippet title()}
		Save changes?
	{/snippet}

	{#snippet buttons()}
		<DialogButton onClick={() => (showSaveConfirmDialog = false)}>Cancel</DialogButton>
		<DialogButton
			strong
			onClick={() => {
				submitForm();
				showSaveConfirmDialog = false;
			}}
		>
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
		class="k-color-brand-red m-2"
		type="button"
		inline
	>
		<DeleteIcon button before />
		{t("Delete {thingName} (irreversible)", thingName)}
	</Button>
{/snippet}
