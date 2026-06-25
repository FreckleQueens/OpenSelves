<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import CurrentFrontIcon from "$lib/components/icons/CurrentFrontIcon.svelte";
	import DismissIcon from "$lib/components/icons/DismissIcon.svelte";
	import FrontIcon from "$lib/components/icons/FrontIcon.svelte";
	import HistoryIcon from "$lib/components/icons/HistoryIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import { Button, Tabbar, TabbarLink, Toast, ToolbarPane } from "konsta/svelte";

	import { MembersTab } from "./tabs";

	let {
		activeTab,
	}: {
		activeTab: MembersTab;
	} = $props();

	let comingSoonToastOpened = $state(false);
</script>

<Tabbar labels icons>
	<ToolbarPane>
		<TabbarLink
			active={activeTab === MembersTab.CURRENT}
			onclick={() => goto(resolve("/members"))}
			label={t("Members & Front")}
		>
			{#snippet icon()}
				<CurrentFrontIcon class="text-xl" />
			{/snippet}
		</TabbarLink>

		<TabbarLink
			active={activeTab === MembersTab.TIMELINE}
			onclick={() => (comingSoonToastOpened = true)}
			label={t("Timeline")}
		>
			{#snippet icon()}
				<FrontIcon class="text-xl" />
			{/snippet}
		</TabbarLink>

		<TabbarLink
			active={activeTab === MembersTab.HISTORY}
			onclick={() => goto(resolve("/members/front/history"))}
			label={t("History")}
		>
			{#snippet icon()}
				<HistoryIcon class="text-xl" />
			{/snippet}
		</TabbarLink>
	</ToolbarPane>
</Tabbar>

<Toast position="center" opened={comingSoonToastOpened}>
	<InfoIcon before />
	<span class="flex-1 mr-2"> Coming soon... </span>

	<Button inline small clear rounded class="p-1" onclick={() => (comingSoonToastOpened = false)}>
		<DismissIcon button />
	</Button>
</Toast>
