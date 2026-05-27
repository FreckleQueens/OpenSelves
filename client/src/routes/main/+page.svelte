<script lang="ts">
	import { MenuItem } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { call, handleLogout } from "$lib/api.svelte";
	import { appState } from "$lib/appState.svelte.js";
	import AppInfo from "$lib/components/AppInfo.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import LogoutIcon from "$lib/components/icons/LogoutIcon.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, BlockTitle, Button, List, ListItem, Preloader } from "konsta/svelte";
	import { GetUser, type GetUserResult, parseApiResult } from "openselves-common";
	import { onMount } from "svelte";

	import ResendVerificationEmail from "./ResendVerificationEmail.svelte";

	let storage: PersistentStorage | undefined = $state();
	let userId: string | undefined = $derived(storage?.getUserIdOptional());
	let user: GetUserResult | undefined = $state();

	requireAuth();
	onMount(() => {
		storage = PersistentStorage.getInstance();
	});

	$effect(() => {
		if (appState.syncWorkerOnline && userId) {
			call(`/user/${userId}`).then((response) => {
				user = parseApiResult(GetUser, response);
			});
		}
	});

	async function logoutButtonOnclick() {
		const result = await call("/auth/logout", {
			method: "POST",
		});
		if (result && typeof result === "object") {
			await handleLogout();
		}
	}
</script>

<AppPage title="" activeMenuItem={MenuItem.HOME}>
	<BlockTitle large>App settings</BlockTitle>

	<BlockTitle medium>Language</BlockTitle>
	<Block strong>
		<LanguageSwitcher />
	</Block>

	<AppInfo />

	<BlockTitle large>Account settings</BlockTitle>

	<BlockTitle medium>Status</BlockTitle>
	<Block strong>
		{#if appState.syncWorkerOnline && user}
			<p>{t("You are logged in as user #{user.id}, {user.email}", user.id, user.email)}</p>
		{:else if !appState.syncWorkerOnline && userId}
			<p>{t("Offline - #{user.id}", userId)}</p>
		{:else}
			<Preloader />
		{/if}
	</Block>

	<BlockTitle medium>Actions</BlockTitle>
	<Block strong>
		<List nested>
			<ResendVerificationEmail bind:user />
			<ListItem>
				{#snippet text()}
					<Button
						id="logout-button"
						tonal
						class="k-color-brand-red"
						raised
						onclick={logoutButtonOnclick}
					>
						<LogoutIcon button before />
						Logout
					</Button>
				{/snippet}
			</ListItem>
		</List>
	</Block>
</AppPage>
