<script lang="ts">
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
	import ServerSwitcher from "$lib/components/ServerSwitcher.svelte";
	import { Block, BlockTitle } from "konsta/svelte";
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
</AppPage>
