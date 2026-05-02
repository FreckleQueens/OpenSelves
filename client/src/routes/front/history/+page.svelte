<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import AppPage from "$lib/components/AppPage.svelte";
	import MemberCard from "$lib/components/MemberCard.svelte";
	import EditIcon from "$lib/components/icons/EditIcon.svelte";
	import SortAscIcon from "$lib/components/icons/SortAscIcon.svelte";
	import SortDescIcon from "$lib/components/icons/SortDescIcon.svelte";
	import { localeState } from "$lib/i18n/i18n";
	import { IDB } from "$lib/idb";
	import { subscribeToModel } from "$lib/idb/component-utils";
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
	import type { Front, Member } from "openselves-common/db";

	import FrontTabbar from "../FrontTabbar.svelte";
	import { FrontTab } from "../tabs.ts";

	let members: { loaded?: boolean; records: Member[] } = $state({
		records: [],
	});
	let fronts: { loaded?: boolean; records: Front[] } = $state({
		records: [],
	});
	let sortedFronts = $derived(
		fronts.records
			.map((front) => ({
				...front,
				member: members.records.find((member) => member.id === front.memberId),
			}))
			.sort((a, b) => {
				const aName = (a.member?.name || t("Unknown")).toLowerCase();
				const bName = (b.member?.name || t("Unknown")).toLowerCase();
				const aEndedAt = a.endedAt?.getTime() || Number.POSITIVE_INFINITY;
				const bEndedAt = b.endedAt?.getTime() || Number.POSITIVE_INFINITY;
				function compare(by: typeof sortBy, directionInt: number) {
					switch (by) {
						case "member":
							return (aName > bName ? 1 : aName < bName ? -1 : 0) * directionInt;
						case "startedAt":
							return (a.startedAt.getTime() - b.startedAt.getTime()) * directionInt;
						case "endedAt":
							return (aEndedAt - bEndedAt) * directionInt;
						default:
							throw new Error("Unimplemented");
					}
				}
				let compared = compare(sortBy, direction === "asc" ? 1 : -1);
				if (compared === 0) {
					compared = compare("startedAt", -1);
				}
				return compared;
			}),
	);
	let sortBy: keyof ArrayElement<typeof sortedFronts> = $state("startedAt");
	let direction: "asc" | "desc" = $state("desc");

	requireAuth();
	const idb = IDB.getInstance();
	subscribeToModel(idb.member, members);
	subscribeToModel(idb.front, fronts);

	function setSortBy(value: typeof sortBy) {
		direction = sortBy === value && direction === "asc" ? "desc" : "asc";
		sortBy = value;
	}
</script>

<AppPage title="" activeMenuItem={MenuItem.FRONT}>
	<BlockTitle>Front history</BlockTitle>
	<Block class="overflow-x-auto pl-safe! pr-safe!">
		<Table>
			<TableHead>
				<TableRow header>
					<TableCell header class="cursor-pointer" onclick={() => setSortBy("member")}>
						<div class="flex items-center">
							Member
							{#if sortBy === "member"}
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
							{#if sortBy === "startedAt"}
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
							{#if sortBy === "endedAt"}
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
								onClick={() => goto(resolve(`/front/edit/${front.id}`))}
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
		<FrontTabbar activeTab={FrontTab.HISTORY} />
	{/snippet}
</AppPage>
