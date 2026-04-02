<script lang="ts">
	import { SyncWorker } from "$lib/idb/SyncWorker.svelte";
	import { MenuItem } from "$lib/index";
	import Icon from "@iconify/svelte";
	import {
		Block,
		Link,
		MenuList,
		MenuListItem,
		Navbar,
		Panel,
		Preloader,
		useTheme,
	} from "konsta/svelte";

	let openMenu = $state(false);
	let syncWorkerError: unknown = $derived(SyncWorker.getInstance().error);

	let {
		children,
		showMenu = true,
		activeMenuItem = undefined,
		navbar = undefined,
		navbarLeft = undefined,
		navbarRight = undefined,
		subnavbar = undefined,
		title = "Open Selves",
		loading = false,
	} = $props();
</script>

<Navbar {title} right={navbarRight} {subnavbar}>
	{#if !loading && navbar}
		{@render navbar()}
	{/if}

	{#snippet left()}
		{#if showMenu}
			<Link onClick={() => (openMenu = true)}>
				<Icon
					icon={useTheme() === "ios" ? "f7:menu" : "ic:baseline-menu"}
					class="text-2xl"
				/>
			</Link>
		{/if}
		{#if navbarLeft}
			{@render navbarLeft()}
		{/if}
	{/snippet}
</Navbar>

<div class="sync">
	{#if syncWorkerError}
		<Block class="text-brand-red">
			Synchronization error:<br />
			{syncWorkerError}
		</Block>
	{/if}
</div>

<Panel side="left" opened={openMenu} onBackdropClick={() => (openMenu = false)}>
	<MenuList>
		<MenuListItem title="Home" active={activeMenuItem === MenuItem.HOME} href="/main">
			{#snippet media()}
				<Icon
					icon={useTheme() === "ios" ? "f7:house-fill" : "ic:round-home"}
					font-size="24px"
				/>
			{/snippet}
		</MenuListItem>
		<MenuListItem title="Members" active={activeMenuItem === MenuItem.MEMBERS} href="/members">
			{#snippet media()}
				<Icon
					icon={useTheme() === "ios" ? "f7:person-2-fill" : "ic:round-people"}
					font-size="24px"
				/>
			{/snippet}
		</MenuListItem>
	</MenuList>
</Panel>

{#if loading}
	<Preloader />
{:else}
	{@render children()}
{/if}
