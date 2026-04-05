<script lang="ts">
	import ErrorDialog from "$lib/ErrorDialog.svelte";
	import { SyncWorker } from "$lib/idb/SyncWorker.svelte";
	import { MenuItem } from "$lib/index";
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

	import { transformErrorToReadable } from "../hooks.client.ts";

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

<ErrorDialog
	additionalErrors={[syncWorkerError ? transformErrorToReadable(syncWorkerError) : null]}
	onDismiss={() => SyncWorker.getInstance().clearError()}
/>

<Panel side="left" opened={openMenu} onBackdropClick={() => (openMenu = false)}>
	<Page>
		<BlockTitle class="justify-start text-2xl mt-2 mb-2">
			<img
				src="/logo_trans_x512.png"
				alt="A stylized ampersand gradually orange to pink from top to bottom. It has two overlapping implicit heart shapes in it."
				class="max-h-16 m-2"
			/>
			OpenSelves
		</BlockTitle>

		<MenuList>
			<MenuListItem title="Home" active={activeMenuItem === MenuItem.HOME} href="/main">
				{#snippet media()}
					<Icon
						icon={useTheme() === "ios" ? "f7:house-fill" : "ic:round-home"}
						font-size="24px"
					/>
				{/snippet}
			</MenuListItem>
			<MenuListItem
				title="Members"
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

<div class="app-page-content">
	{#if title || navbarLeft || navbarRight || navbar || showMenu || subnavbar}
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
