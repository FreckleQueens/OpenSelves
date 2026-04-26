<script lang="ts">
	import { PUBLIC_APP_VERSION } from "$env/static/public";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import ServerSwitcher from "$lib/components/forms/ServerSwitcher.svelte";
	import { requireGuest } from "$lib/routing-utils";
	import { Block, BlockTitle } from "konsta/svelte";

	requireGuest();
</script>

<AppPage title="" showMenu={false}>
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

	<BlockTitle>App info</BlockTitle>
	<Block>
		<p>{t("OpenSelves client version {PUBLIC_APP_VERSION}", PUBLIC_APP_VERSION)}</p>
	</Block>
</AppPage>
