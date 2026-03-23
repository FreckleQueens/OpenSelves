<script lang="ts">
	import { MenuItem } from "$lib/index";
	import { Link, MenuList, MenuListItem, Navbar, Panel, Preloader } from "konsta/svelte";

	let openMenu = $state(false);

	let {
		children,
		showMenu = true,
		activeMenuItem,
		navbar,
		navbarLeft,
		navbarRight,
		subnavbar,
		title,
		loading,
	} = $props();
</script>

<Navbar title={typeof title === "string" ? title : "Open Selves"} right={navbarRight} {subnavbar}>
	{#if !loading && navbar}
		{@render navbar()}
	{/if}

	{#snippet left()}
		{#if showMenu}
			<Link onClick={() => (openMenu = true)}>Menu</Link>
		{/if}
		{#if navbarLeft}
			{@render navbarLeft()}
		{/if}
	{/snippet}
</Navbar>

<Panel side="left" opened={openMenu} onBackdropClick={() => (openMenu = false)}>
	<MenuList>
		<MenuListItem title="Home" active={activeMenuItem === MenuItem.HOME} href="/main" />
		<MenuListItem
			title="Members"
			active={activeMenuItem === MenuItem.MEMBERS}
			href="/members"
		/>
	</MenuList>
</Panel>

{#if loading}
	<Preloader />
{:else}
	{@render children()}
{/if}
