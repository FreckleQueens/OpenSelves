<script lang="ts">
	import AppInfo from "$lib/components/AppInfo.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import Contributors from "$lib/components/Contributors.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import ServerSwitcher from "$lib/components/forms/ServerSwitcher.svelte";
	import { requireGuest } from "$lib/routing-utils";
	import { Block, BlockTitle } from "konsta/svelte";

	import UserProfiles from "./UserProfiles.svelte";

	requireGuest();
</script>

<AppPage title="" showMenu={false} nested>
	{#snippet navbarLeft()}
		<BackLink />
	{/snippet}
	<BlockTitle>Change language</BlockTitle>
	<Block>
		<LanguageSwitcher />
	</Block>

	<BlockTitle>Change server</BlockTitle>
	<Block>
		<ServerSwitcher />
	</Block>

	<BlockTitle>User profiles</BlockTitle>
	<Block>
		<UserProfiles />
	</Block>

	<AppInfo />

	<Contributors />
</AppPage>
