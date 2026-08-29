<script lang="ts">
	import AppInfo from "$lib/components/AppInfo.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import Contributors from "$lib/components/Contributors.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import { requireNoCurrentProfile } from "$lib/routing-utils";
	import { Block, BlockTitle } from "konsta/svelte";

	requireNoCurrentProfile();
</script>

<AppPage title="" showMenu={false} nested>
	{#snippet navbarLeft()}
		<BackLink />
	{/snippet}
	<BlockTitle>Change language</BlockTitle>
	<Block>
		<LanguageSwitcher />
	</Block>

	<AppInfo />

	<Contributors />
</AppPage>
