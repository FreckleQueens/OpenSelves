<script lang="ts">
	import { MenuItem } from "$lib";
	import ErrorDialog from "$lib/components/ErrorDialog.svelte";
	import { SyncWorker } from "$lib/idb/SyncWorker.svelte.js";
	import Icon from "@iconify/svelte";
	import {
		BlockTitle,
		Link,
		MenuList,
		MenuListItem,
		Navbar,
		Page,
		Panel,
		Preloader,
		useTheme,
	} from "konsta/svelte";

	import { transformErrorToReadable } from "../../hooks.client.ts";

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
		transparentNavbar = false,
		title = "OpenSelves",
		loading = false,
		pageContent = $bindable(),
	} = $props();
</script>

<ErrorDialog
	additionalErrors={[syncWorkerError ? transformErrorToReadable(syncWorkerError) : null]}
	onDismiss={() => SyncWorker.getInstance().clearError()}
/>

<Panel side="left" opened={openMenu} onBackdropClick={() => (openMenu = false)}>
	<Page>
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

		<MenuList>
			<MenuListItem title={t("Home")} active={activeMenuItem === MenuItem.HOME} href="/main">
				{#snippet media()}
					<Icon
						icon={useTheme() === "ios" ? "f7:house-fill" : "ic:round-home"}
						font-size="24px"
					/>
				{/snippet}
			</MenuListItem>
			<MenuListItem
				title={t("Members")}
				active={activeMenuItem === MenuItem.MEMBERS}
				href="/members"
			>
				{#snippet media()}
					<Icon
						icon={useTheme() === "ios" ? "f7:person-2-fill" : "ic:round-people"}
						font-size="24px"
					/>
				{/snippet}
			</MenuListItem>
		</MenuList>
	</Page>
</Panel>

<div class="app-page-content" bind:this={pageContent}>
	{#if title || navbarLeft || navbarRight || navbar || showMenu || subnavbar}
		<Navbar {title} right={navbarRight} {subnavbar} transparent={transparentNavbar}>
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
	{/if}

	{#if loading}
		<Preloader />
	{:else}
		{@render children()}
	{/if}
</div>

<style lang="scss">
	.app-page-content {
		height: 100%;
		overflow-y: scroll;
	}
</style>
