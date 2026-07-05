<script lang="ts">
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { sortBy } from "$lib/component-utils.js";
	import AppPage from "$lib/components/AppPage.svelte";
	import FrontNote from "$lib/components/FrontNote.svelte";
	import FrontTimeFrontedFor from "$lib/components/FrontTimeFrontedFor.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import { subscribeToModel } from "$lib/idb/entry-subscription.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, BlockTitle } from "konsta/svelte";
	import { Front, Member } from "openselves-common/client";

	let members = $derived.by(subscribeToModel(Member));
	let fronts = $derived.by(subscribeToModel(Front));
	let currentFronts = $derived(
		fronts.staticData
			.filter((front) => !front.endedAt)
			.map((front) => {
				const member = members.staticData.find((member) => member.id === front.memberId);
				return {
					...front,
					member,
					memberName: member?.name || t("Unknown"),
					frontingFor: Date.now() - front.startedAt.getTime(),
				};
			})
			.sort(sortBy((front) => front.memberName)),
	);
	let pageContent: HTMLDivElement | undefined = $state();

	requireAuth();
</script>

<AppPage title="" bind:pageContent activeMenuItem={MenuItem.DASHBOARD}>
	<a href={resolve("/members")}>
		<BlockTitle medium>Currently fronting</BlockTitle>
		<Block id="current-fronting-members" class="pt-2 pb-2">
			{#each currentFronts as front (front.id)}
				{@const member = members.staticData.find((member) => member.id === front.memberId)}
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
			{:else}
				<p class="no-front">No one is currently fronting.</p>
			{/each}
		</Block>
	</a>
</AppPage>
