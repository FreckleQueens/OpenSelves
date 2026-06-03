<script lang="ts">
	import { MenuItem } from "$lib";
	import AppInfo from "$lib/components/AppInfo.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, BlockTitle } from "konsta/svelte";

	requireAuth();
</script>

<AppPage title="" activeMenuItem={MenuItem.SETTINGS}>
	<BlockTitle large>App settings</BlockTitle>

	<BlockTitle medium>Language</BlockTitle>
	<Block strong>
		<LanguageSwitcher />
	</Block>

	<AppInfo />
</AppPage>
