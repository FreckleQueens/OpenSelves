<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import AppPage from "$lib/AppPage.svelte";
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
		NavbarBackLink,
		Segmented,
		SegmentedButton,
	} from "konsta/svelte";
	import { onMount } from "svelte";

	import type { Member } from "../../../../generated/prisma/client/generated/browser";
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
	});
	let originalMember: Member | null = null;

	let mounted = $state(false);
	onMount(async () => {
		const idb = await IDB.getClient();
		if (params.memberId) {
			member = await idb.member.findUniqueOrThrow({ where: { id: params.memberId } });
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
		}
	> = {};
	tabs[Tab.INFO] = {
		title: "Info",
	};
	tabs[Tab.SETTINGS] = {
		title: "Settings",
	};

	let form: HTMLFormElement;
	async function formOnSubmit(e?: SubmitEvent) {
		e?.preventDefault();
		const formData: Record<string, string> = {};
		for (const [key, value] of new FormData(form).entries()) {
			formData[key] = value;
		}

		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const idb = await IDB.getClient();
		if (!member.id) {
			member = await idb.member.create({
				data: {
					userId,
					name: formData["name"],
					description: formData["description"],
					pronouns: formData["pronouns"],
				},
			});
		} else {
			member = await idb.member.update({
				where: { id: member.id },
				data: {
					name: formData["name"],
					description: formData["description"],
					pronouns: formData["pronouns"],
				},
			});
		}

		await goto(resolve("/members"));
	}

	let showBackLinkConfirmDialog = $state(false);
	async function backLinkOnClick(e: Event) {
		e.preventDefault();
		if (JSON.stringify(member) !== JSON.stringify(originalMember)) {
			showBackLinkConfirmDialog = true;
		} else {
			discardChanges();
		}
	}
	function closeBackLinkConfirmDialog() {
		showBackLinkConfirmDialog = false;
	}
	function discardChanges() {
		history.back();
	}

	let openDeleteMemberDialog = $state(false);
	async function deleteMember() {
		const idb = await IDB.getClient();
		await idb.member.delete({ where: { id: member.id } });
		await goto(resolve("/members"));
	}
</script>

<Dialog opened={showBackLinkConfirmDialog} onBackdropClick={closeBackLinkConfirmDialog}>
	{#snippet title()}
		Save changes?
	{/snippet}

	{#snippet buttons()}
		<DialogButton onClick={closeBackLinkConfirmDialog}>Cancel</DialogButton>
		<DialogButton strong class="k-color-brand-red" onClick={discardChanges}>
			No (discard)
		</DialogButton>
		<DialogButton strong onClick={formOnSubmit}>Yes</DialogButton>
	{/snippet}
</Dialog>

<Dialog opened={openDeleteMemberDialog} onBackdropClick={() => (openDeleteMemberDialog = false)}>
	{#snippet title()}
		Delete member
	{/snippet}

	Are you sure you want to delete this member? This action cannot be reverted.

	{#snippet buttons()}
		<DialogButton onClick={() => (openDeleteMemberDialog = false)}>No</DialogButton>
		<DialogButton strong onClick={deleteMember}>Yes</DialogButton>
	{/snippet}
</Dialog>

<AppPage title="" loading={!mounted} showMenu={false}>
	{#snippet navbarLeft()}
		<NavbarBackLink onClick={backLinkOnClick} />
	{/snippet}
	{#snippet navbarRight()}
		<Link onClick={formOnSubmit}>Save</Link>
	{/snippet}

	{#snippet subnavbar()}
		<Segmented class="p-0">
			{#each Object.entries(tabs) as [key, tab] (key)}
				<SegmentedButton
					active={activeTab === parseInt(key)}
					onClick={() => (activeTab = parseInt(key))}>{tab.title}</SegmentedButton
				>
			{/each}
		</Segmented>
	{/snippet}

	{#if activeTab === Tab.INFO}
		<form bind:this={form} onsubmit={formOnSubmit}>
			<List>
				<ListInput
					name="name"
					label="Name"
					floatingLabel
					required
					bind:value={member.name}
				/>
				<ListInput
					name="pronouns"
					label="Pronouns"
					floatingLabel
					bind:value={member.pronouns}
				/>
				<ListInput
					name="description"
					label="Description"
					floatingLabel
					type="textarea"
					autocomplete="off"
					inputClass="min-h-20"
					bind:value={member.description}
				/>
			</List>
		</form>
	{:else if activeTab === Tab.SETTINGS}
		{#if member.id}
			<BlockTitle class="text-brand-red">Danger zone</BlockTitle>
			<Block>
				<Button onClick={() => (openDeleteMemberDialog = true)}
					>Delete member (irreversible)</Button
				>
			</Block>
		{/if}
	{/if}
</AppPage>
