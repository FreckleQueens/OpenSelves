<script lang="ts">
	import { MenuItem } from "$lib";
	import { appState } from "$lib/appState.svelte.js";
	import ErrorDialog from "$lib/components/ErrorDialog.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import FrontIcon from "$lib/components/icons/FrontIcon.svelte";
	import HomeIcon from "$lib/components/icons/HomeIcon.svelte";
	import MenuIcon from "$lib/components/icons/MenuIcon.svelte";
	import PeopleIcon from "$lib/components/icons/PeopleIcon.svelte";
	import { SyncWorker } from "$lib/idb/SyncWorker.js";
	import {
		Block,
		BlockTitle,
		Link,
		MenuList,
		MenuListItem,
		Navbar,
		Page,
		Panel,
		Preloader,
	} from "konsta/svelte";
	import { type Snippet } from "svelte";
	import { fly } from "svelte/transition";

	import { transformErrorToReadable } from "../../hooks.client.ts";

	let {
		children,
		bottomNav,
		showMenu = true,
		activeMenuItem = undefined,
		navbar = undefined,
		navbarLeft = undefined,
		navbarRight = undefined,
		subnavbar = undefined,
		transparentNavbar = false,
		title = "OpenSelves",
		loading = false,
		pageContent = $bindable(),
	}: {
		children: Snippet;
		bottomNav?: Snippet;
		showMenu?: boolean;
		activeMenuItem?: MenuItem;
		navbar?: Snippet;
		navbarLeft?: Snippet;
		navbarRight?: Snippet;
		subnavbar?: Snippet;
		transparentNavbar?: boolean;
		title?: string | Snippet;
		loading?: boolean;
		pageContent?: HTMLDivElement | undefined;
	} = $props();

	let openMenu = $state(false);
	let syncWorkerError: unknown = $derived(appState.syncWorkerError);
</script>

<ErrorDialog
	additionalErrors={[syncWorkerError ? transformErrorToReadable(syncWorkerError) : null]}
	onDismiss={() => SyncWorker.getInstance().clearError()}
/>

<Panel side="left" opened={openMenu} onBackdropClick={() => (openMenu = false)}>
	<Page class="pt-safe pb-safe pl-safe flex flex-col">
		<BlockTitle class="justify-start text-2xl mt-2 mb-2">
			<img
				src="/logo_trans.svg"
				alt={t(
					"A stylized ampersand gradually orange to pink from top to bottom. It has two overlapping implicit heart shapes in it.",
				)}
				class="h-16 m-2"
			/>
			OpenSelves
		</BlockTitle>

		<MenuList class="flex-1">
			<MenuListItem title={t("Home")} active={activeMenuItem === MenuItem.HOME} href="/main">
				{#snippet media()}
					<HomeIcon class="text-xl" />
				{/snippet}
			</MenuListItem>
			<MenuListItem
				title={t("Front")}
				active={activeMenuItem === MenuItem.FRONT}
				href="/front"
			>
				{#snippet media()}
					<FrontIcon class="text-xl" />
				{/snippet}
			</MenuListItem>
			<MenuListItem
				title={t("Members")}
				active={activeMenuItem === MenuItem.MEMBERS}
				href="/members"
			>
				{#snippet media()}
					<PeopleIcon class="text-xl" />
				{/snippet}
			</MenuListItem>
		</MenuList>

		<hr class="border-t-md-light-on-surface dark:border-t-md-dark-on-surface opacity-25" />
		<Block class="">
			<div class="flex items-center">
				{#if !appState.isAuthenticated}
					Exclusive offline mode
				{:else if appState.syncWorkerOnline}
					Sync active (online)
				{:else}
					<DangerIcon before class="text-brand-red" /> Sync inactive (offline)
				{/if}
			</div>
		</Block>
	</Page>
</Panel>

{#if title || navbarLeft || navbarRight || navbar || showMenu || subnavbar}
	<Navbar
		{title}
		right={navbarRight || ""}
		subnavbar={subnavbar || ""}
		transparent={transparentNavbar}
	>
		{#if !loading && navbar}
			{@render navbar()}
		{/if}

		{#snippet left()}
			{#if showMenu}
				<Link onClick={() => (openMenu = true)}>
					<MenuIcon button />
				</Link>
			{/if}
			{#if navbarLeft}
				{@render navbarLeft()}
			{/if}
		{/snippet}
	</Navbar>
{/if}

<div class="app-page-content flex-1 overflow-y-auto" bind:this={pageContent}>
	{#if loading}
		<Preloader />
	{:else}
		{@render children()}
	{/if}
</div>

<div class="app-bottom-nav bottom-0 left-0 w-full">
	{#if bottomNav}
		{@render bottomNav()}
	{/if}
	{#if appState.isAuthenticated && !appState.syncWorkerOnline}
		<div
			class="p-2 pb-safe-2 justify-center flex items-center bg-md-light-surface text-md-light-on-surface dark:bg-md-dark-surface dark:text-md-dark-on-surface"
			transition:fly={{ duration: 150, y: 16 }}
		>
			<DangerIcon before class="text-brand-red" /> Sync inactive (offline)
		</div>
	{/if}
</div>

<style lang="scss">
	:global .app-bottom-nav:has(.pb-safe:last-child) .mb-safe {
		margin-bottom: 0;
	}
</style>
