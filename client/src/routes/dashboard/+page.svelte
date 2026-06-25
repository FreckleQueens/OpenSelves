<script lang="ts">
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import AppPage from "$lib/components/AppPage.svelte";
	import FrontNote from "$lib/components/FrontNote.svelte";
	import FrontTimeFrontedFor from "$lib/components/FrontTimeFrontedFor.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import { IDB } from "$lib/idb";
	import { type SubscriptionState, sortBy, subscribeToModel } from "$lib/idb/component-utils";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, BlockTitle, Preloader } from "konsta/svelte";
	import type { Front, Member } from "openselves-common/db";

	let members: SubscriptionState<Member> = $state({
		records: [],
	});
	let fronts: SubscriptionState<Front> = $state({
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
			.sort(sortBy((front) => front.member.name)),
	);
	let pageContent: HTMLDivElement | undefined = $state();

	requireAuth();

	const idb = IDB.getInstance();
	subscribeToModel(idb.member, members);
	subscribeToModel(idb.front, fronts);
</script>

<AppPage title="" bind:pageContent activeMenuItem={MenuItem.DASHBOARD}>
	<a href={resolve("/members")}>
		<BlockTitle medium>Currently fronting</BlockTitle>
		<Block id="current-fronting-members" class="pt-2 pb-2">
			{#each currentFronts as front (front.id)}
				{@const member = members.records.find((member) => member.id === front.memberId)}
				{#if member}
					<MemberCard {member}>
						{#snippet chips()}
							<FrontTimeFrontedFor {front} />
						{/snippet}

						{#snippet footer()}
							{#if front.note}
								<FrontNote {front} />
							{/if}
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
	</a>
</AppPage>
