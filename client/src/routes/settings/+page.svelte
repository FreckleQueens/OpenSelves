<script lang="ts">
	import { MenuItem } from "$lib";
	import AppInfo from "$lib/components/AppInfo.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import Contributors from "$lib/components/Contributors.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import { requireCurrentProfile } from "$lib/routing-utils";
	import { Block, BlockTitle } from "konsta/svelte";

	requireCurrentProfile();
</script>

<AppPage title="" activeMenuItem={MenuItem.SETTINGS}>
	<BlockTitle large>App settings</BlockTitle>

	<BlockTitle medium>Language</BlockTitle>
	<Block strong>
		<LanguageSwitcher />
	</Block>

	<AppInfo />

	<Contributors />
</AppPage>
