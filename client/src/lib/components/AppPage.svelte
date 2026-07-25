<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { transformErrorToReadable } from "$lib";
	import AppUpdateDialog from "$lib/components/AppUpdateDialog.svelte";
	import ErrorDialog from "$lib/components/ErrorDialog.svelte";
	import AccountIcon from "$lib/components/icons/AccountIcon.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DashboardIcon from "$lib/components/icons/DashboardIcon.svelte";
	import MenuIcon from "$lib/components/icons/MenuIcon.svelte";
	import PeopleIcon from "$lib/components/icons/PeopleIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import type { OSIconProps } from "$lib/components/os-icon";
	import { activeSubscriptions } from "$lib/idb/entry-subscription.svelte";
	import { Profile } from "$lib/idb/profiles";
	import { SyncWorker } from "$lib/idb/sync";
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
	import { type Component, type Snippet, onDestroy, onMount } from "svelte";
	import { fade, fly } from "svelte/transition";

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
		nested = false,
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
		nested?: boolean;
	} = $props();

	let openMenu = $state(false);
	let syncWorkerError: unknown = $derived(SyncWorker.error);
	let areSubscriptionsLoading: boolean = $derived(
		activeSubscriptions.values().some((sub) => !sub().loaded),
	);
	let mounted: boolean = $state(false);
	let isLoading: boolean = $derived(loading || areSubscriptionsLoading);
	let isReady: boolean = $derived(mounted && !isLoading);
	let showLoadingSpinner: boolean = $state(false);

	let showLoadingSpinnerTimeout: number | undefined;
	$effect(() => {
		clearTimeout(showLoadingSpinnerTimeout);
		if (isLoading) {
			showLoadingSpinnerTimeout = window.setTimeout(() => (showLoadingSpinner = true), 400);
		}
	});

	const menuItems: {
		[k in MenuItem]: {
			title: string;
			href: string;
			iconComponent: Component<OSIconProps>;
		};
	} = {
		[MenuItem.DASHBOARD]: {
			title: t("Dashboard"),
			href: resolve("/dashboard"),
			iconComponent: DashboardIcon,
		},
		[MenuItem.MEMBERS]: {
			title: t("Members & Front"),
			href: resolve("/members"),
			iconComponent: PeopleIcon,
		},
		[MenuItem.PROFILE]: {
			title: t("Profile"),
			href: resolve("/profile"),
			iconComponent: AccountIcon,
		},
		[MenuItem.SETTINGS]: {
			title: t("Settings"),
			href: resolve("/settings"),
			iconComponent: SettingsIcon,
		},
	};

	onMount(() => {
		mounted = true;
	});
	onDestroy(() => {
		mounted = false;
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<ErrorDialog
	additionalErrors={[syncWorkerError ? transformErrorToReadable(syncWorkerError) : null]}
	onDismiss={() => SyncWorker.clearError()}
/>

<AppUpdateDialog />

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
			<div class="flex flex-col gap-2">
				<span>OpenSelves</span>
				<sup class="uppercase font-thin text-xs">Early access</sup>
			</div>
		</BlockTitle>

		<MenuList class="flex-1">
			{#each Object.values(menuItems) as entry, key (key)}
				{@const Icon = entry.iconComponent}
				<MenuListItem title={entry.title} active={activeMenuItem === key} href={entry.href}>
					{#snippet media()}
						<Icon class="text-xl" />
					{/snippet}
				</MenuListItem>
			{/each}
		</MenuList>

		<hr class="border-t-md-light-on-surface dark:border-t-md-dark-on-surface opacity-25" />
		<Block>
			<div class="flex items-center">
				{#if !Profile.hasCurrentProfile()}
					Exclusive offline mode
				{:else if SyncWorker.running}
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
		{#if !isLoading && navbar}
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

<div
	class={"app-page-content flex-1 overflow-y-auto" +
		(nested ? " nested" : "") +
		(isReady ? " ready" : "")}
	bind:this={pageContent}
>
	{#if isLoading}
		{#if showLoadingSpinner}
			<div
				class="fixed top-1/2 left-1/2"
				style="transform: translateX(-50%) translateY(-50%)"
				transition:fade={{ duration: 50 }}
			>
				<Preloader />
			</div>
		{/if}
	{:else}
		<div transition:fade={{ duration: 100 }}>
			{@render children()}
		</div>
	{/if}
</div>

<div class="app-bottom-nav bottom-0 left-0 w-full">
	{#if bottomNav}
		{@render bottomNav()}
	{/if}

	{#if Profile.hasCurrentProfile() && !SyncWorker.running}
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
