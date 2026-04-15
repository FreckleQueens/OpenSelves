<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import CurrentFrontIcon from "$lib/components/icons/CurrentFrontIcon.svelte";
	import HistoryIcon from "$lib/components/icons/HistoryIcon.svelte";
	import { Tabbar, TabbarLink, ToolbarPane } from "konsta/svelte";

	import { FrontTab } from "./tabs";

	let {
		activeTab,
	}: {
		activeTab: FrontTab;
	} = $props();
</script>

<Tabbar labels icons>
	<ToolbarPane>
		<TabbarLink
			active={activeTab === FrontTab.CURRENT}
			onclick={() => goto(resolve("/front"))}
			label={t("Current front")}
		>
			{#snippet icon()}
				<CurrentFrontIcon class="text-xl" />
			{/snippet}
		</TabbarLink>

		<TabbarLink
			active={activeTab === FrontTab.HISTORY}
			onclick={() => goto(resolve("/front/history"))}
			label={t("History")}
		>
			{#snippet icon()}
				<HistoryIcon class="text-xl" />
			{/snippet}
		</TabbarLink>
	</ToolbarPane>
</Tabbar>
