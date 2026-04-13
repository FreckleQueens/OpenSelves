<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import AppPage from "$lib/components/AppPage.svelte";
	import FabMenu from "$lib/components/FabMenu.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import DeleteSweepIcon from "$lib/components/icons/DeleteSweepIcon.svelte";
	import LeaveFrontIcon from "$lib/components/icons/LeaveFrontIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import { localeState } from "$lib/i18n/i18n";
	import { IDB } from "$lib/idb";
	import { subscribeToModel } from "$lib/idb/component-utils";
	import { Storage } from "$lib/storage";
	import humanizeDuration from "humanize-duration";
	import {
		Block,
		BlockTitle,
		Button,
		Chip,
		Dialog,
		Navbar,
		Preloader,
		Searchbar,
		Sheet,
	} from "konsta/svelte";
	import type { Front, Member } from "openselves-common/db";
	import { onMount } from "svelte";

	let members: { loaded?: boolean; records: Member[] } = $state({
		records: [],
	});
	let fronts: { loaded?: boolean; records: Front[] } = $state({
		records: [],
	});
	let currentFronts = $derived(
		fronts.records
			.filter((front) => members.loaded && !front.endedAt)
			.map((front) => {
				const member = members.records.find((member) => member.id === front.memberId);
				if (!member) {
					throw new Error("Member not found for front " + front.id);
				}
				return {
					...front,
					member: member,
					frontingFor: Date.now() - front.startedAt.getTime(),
				};
			})
			.sort((a, b) => {
				if (a.member.name < b.member.name) {
					return -1;
				}
				if (a.member.name > b.member.name) {
					return 1;
				}
				return 0;
			}),
	);
	let memberSearch: string = $state("");
	let selectableMembers = $derived(
		members.records
			.filter(
				(member) =>
					!member.isArchived &&
					!currentFronts.find((front) => front.memberId === member.id) &&
					member.name.includes(memberSearch),
			)
			.sort((a, b) => {
				if (a.name < b.name) {
					return -1;
				}
				if (a.name > b.name) {
					return 1;
				}
				return 0;
			}),
	);
	let pageContent: HTMLDivElement | undefined = $state();
	let showMemberSelectSheet = $state(false);
	let showClearFrontDialog = $state(false);

	subscribeToModel(async () => {
		const idb = await IDB.getClient();
		return idb.member;
	}, members);
	subscribeToModel(async () => {
		const idb = await IDB.getClient();
		return idb.front;
	}, fronts);

	async function selectMember(member: Member) {
		const storage = await Storage.getStorage();
		const idb = await IDB.getClient();

		const now = new Date();
		const front: Omit<Front, "userId"> = {
			id: "",
			memberId: member.id,
			startedAt: now,
			endedAt: null,
			note: null,
			createdAt: now,
			updatedAt: now,
		};
		await idb.front.saveSynced(storage.getKey(), front);
		showMemberSelectSheet = false;
	}

	async function endFront(frontId: string) {
		const storage = await Storage.getStorage();
		const idb = await IDB.getClient();

		await idb.front.saveSynced(
			storage.getKey(),
			{
				id: frontId,
				endedAt: new Date(),
			},
			true,
		);
	}

	async function endAllFronts() {
		showClearFrontDialog = false;
		for (const front of [...currentFronts]) {
			await endFront(front.id);
		}
	}

	onMount(() => {
		const interval = window.setInterval(() => {
			fronts.records = [...fronts.records]; // Re-calculate frontingFor
		}, 1000);
		return () => window.clearInterval(interval);
	});
</script>

<AppPage title="" bind:pageContent activeMenuItem={MenuItem.FRONT}>
	<FabMenu
		menuItems={[
			{
				id: "add-front",
				icon: PlusIcon,
				action: () => {
					showMemberSelectSheet = true;
				},
			},
			{
				id: "reset-front",
				icon: DeleteSweepIcon,
				action: () => {
					showClearFrontDialog = true;
				},
			},
		]}
		bind:pageContent
	/>

	<BlockTitle medium>Currently fronting</BlockTitle>
	<Block id="current-fronting-members" class="pt-2 pb-2">
		{#each currentFronts as front (front.id)}
			{@const member = members.records.find((member) => member.id === front.memberId)}
			{#if member}
				<MemberCard
					{member}
					onClick={() => goto(resolve(`/members/edit/${front.memberId}`))}
					actions={[
						{
							id: "end-front",
							icon: LeaveFrontIcon,
							onClick: () => endFront(front.id),
						},
					]}
				>
					{#snippet chips()}
						<Chip>
							<time datetime={front.startedAt.toISOString()}
								>{humanizeDuration(front.frontingFor, {
									language: localeState.locale || undefined,
									round: true,
									fallbacks: ["en"],
									largest: 2,
								})}</time
							>
						</Chip>
					{/snippet}
				</MemberCard>
			{/if}
		{:else}
			{#if !members.loaded || !fronts.loaded}
				<Preloader />
			{:else}
				<p class="no-front">No one is currently fronting.</p>
			{/if}
		{/each}
	</Block>
</AppPage>

<Sheet
	class="pb-safe flex flex-col"
	style="height: calc(100vh - 72px)"
	opened={showMemberSelectSheet}
	onBackdropClick={() => (showMemberSelectSheet = false)}
>
	<Navbar title="Select fronter" bgClass="bg-transparent">
		{#snippet subnavbar()}
			<Searchbar
				placeholder={t("Search by name...")}
				class="p-4 rounded-3xl"
				clearButton
				bind:value={memberSearch}
				onClear={() => (memberSearch = "")}
			/>
		{/snippet}
	</Navbar>
	<Block class="overflow-y-auto">
		{#each selectableMembers as member (member.id)}
			<MemberCard {member} onClick={() => selectMember(member)} small />
		{/each}
	</Block>
</Sheet>

<Dialog opened={showClearFrontDialog} onBackdropClick={() => (showClearFrontDialog = false)}>
	{#snippet title()}
		Clear front
	{/snippet}

	This will mark all front entries as ended.

	{#snippet buttons()}
		<Button onclick={() => (showClearFrontDialog = false)}>Cancel</Button>
		<Button class="k-color-brand-red" onclick={() => endAllFronts()}>
			<DeleteSweepIcon button before />
			Confirm
		</Button>
	{/snippet}
</Dialog>
