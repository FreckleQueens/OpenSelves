<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { sortBy } from "$lib/component-utils.js";
	import AppPage from "$lib/components/AppPage.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import EditIcon from "$lib/components/icons/EditIcon.svelte";
	import SortAscIcon from "$lib/components/icons/SortAscIcon.svelte";
	import SortDescIcon from "$lib/components/icons/SortDescIcon.svelte";
	import { localeState } from "$lib/i18n/i18n";
	import { subscribeToModel } from "$lib/idb/entry-subscription.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import {
		Block,
		BlockTitle,
		Button,
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableRow,
	} from "konsta/svelte";
	import type { ArrayElement } from "openselves-common";
	import { Front, Member } from "openselves-common/client";

	import MembersTabbar from "../../MembersTabbar.svelte";
	import { MembersTab } from "../../tabs.ts";

	let members = $derived.by(subscribeToModel(Member));
	let fronts = $derived.by(subscribeToModel(Front));

	let sortByField: keyof ArrayElement<typeof sortedFronts> = $state("startedAt");
	let direction: "asc" | "desc" = $state("desc");
	let sortedFronts = $derived(
		fronts.staticData
			.map((front) => ({
				...front,
				member: members.staticData.find((member) => member.id === front.memberId),
			}))
			.sort(
				sortBy(
					direction,
					(front) => {
						switch (sortByField) {
							case "member":
								return front.member?.name || t("Unknown");
							case "startedAt":
								return front.startedAt.getTime();
							case "endedAt":
								return front.endedAt?.getTime() || Number.POSITIVE_INFINITY;
							default:
								throw new Error("Unimplemented");
						}
					},
					(front) => front.startedAt.getTime(),
				),
			),
	);

	requireAuth();

	function setSortBy(value: typeof sortByField) {
		direction = sortByField === value && direction === "asc" ? "desc" : "asc";
		sortByField = value;
	}
</script>

<AppPage title="" activeMenuItem={MenuItem.MEMBERS}>
	<BlockTitle>Front history</BlockTitle>
	<Block class="overflow-x-auto pl-safe! pr-safe!">
		<Table>
			<TableHead>
				<TableRow header>
					<TableCell header class="cursor-pointer" onclick={() => setSortBy("member")}>
						<div class="flex items-center">
							Member
							{#if sortByField === "member"}
								{#if direction === "asc"}
									<SortAscIcon class="text-xl" after />
								{:else}
									<SortDescIcon class="text-xl" after />
								{/if}
							{/if}
						</div>
					</TableCell>
					<TableCell header class="cursor-pointer" onclick={() => setSortBy("startedAt")}>
						<div class="flex items-center">
							Start
							{#if sortByField === "startedAt"}
								{#if direction === "asc"}
									<SortAscIcon class="text-xl" after />
								{:else}
									<SortDescIcon class="text-xl" after />
								{/if}
							{/if}
						</div>
					</TableCell>
					<TableCell header class="cursor-pointer" onclick={() => setSortBy("endedAt")}>
						<div class="flex items-center">
							End
							{#if sortByField === "endedAt"}
								{#if direction === "asc"}
									<SortAscIcon class="text-xl" after />
								{:else}
									<SortDescIcon class="text-xl" after />
								{/if}
							{/if}
						</div>
					</TableCell>
					<TableCell header>Actions</TableCell>
				</TableRow>
			</TableHead>
			<TableBody>
				{#each sortedFronts as front (front.id)}
					<TableRow class="text-nowrap">
						<TableCell class="flex items-center">
							<MemberCard member={front.member} small inline />
						</TableCell>
						<TableCell>
							<time datetime={front.startedAt.toISOString()}>
								{front.startedAt.toLocaleDateString(localeState.locale || "en")}
								{front.startedAt.toLocaleTimeString(localeState.locale || "en")}
							</time>
						</TableCell>
						<TableCell>
							{#if front.endedAt}
								<time datetime={front.endedAt.toISOString()}>
									{front.endedAt.toLocaleDateString(localeState.locale || "en")}
									{front.endedAt.toLocaleTimeString(localeState.locale || "en")}
								</time>
							{:else}
								{"" + "-"}
							{/if}
						</TableCell>
						<TableCell>
							<Button
								small
								class="edit-front-button p-2"
								inline
								onClick={() => goto(resolve(`/members/front/edit/${front.id}`))}
							>
								<EditIcon />
							</Button>
						</TableCell>
					</TableRow>
				{:else}
					<TableRow>
						<p>No front yet</p>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</Block>

	{#snippet bottomNav()}
		<MembersTabbar activeTab={MembersTab.HISTORY} />
	{/snippet}
</AppPage>
