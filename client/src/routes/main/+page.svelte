<script lang="ts">
	import { MenuItem } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { call, handleLogout } from "$lib/api.svelte";
	import { appState } from "$lib/appState.svelte.js";
	import AppPage from "$lib/components/AppPage.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import LogoutIcon from "$lib/components/icons/LogoutIcon.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, BlockTitle, Button, Preloader } from "konsta/svelte";
	import { onMount } from "svelte";

	let storage: PersistentStorage | undefined = $state();
	let userId: string | undefined = $derived(storage?.getUserId());
	let user:
		| {
				id: string;
				email: string;
		  }
		| undefined = $state();

	requireAuth();
	onMount(() => {
		storage = PersistentStorage.getInstance();
	});

	$effect(() => {
		let online = appState.syncWorkerOnline;
		if (online && userId) {
			call(`/user/${userId}`).then((response) => {
				if (response) {
					if (!("id" in response && "email" in response)) {
						throw new Error("Bad server response");
					}
					user = {
						id: `${response.id}`,
						email: `${response.email}`,
					};
				}
			});
		}
	});

	const logoutButtonOnclick = async () => {
		const result = await call("/auth/logout", {
			method: "POST",
		});
		if (result && typeof result === "object") {
			await handleLogout();
		}
	};
</script>

<AppPage title="" activeMenuItem={MenuItem.HOME}>
	<BlockTitle large>App settings</BlockTitle>

	<BlockTitle medium>Language</BlockTitle>
	<Block strong>
		<LanguageSwitcher />
	</Block>

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
		<Button id="logout-button" tonal raised onclick={logoutButtonOnclick}>
			<LogoutIcon button before />
			Logout
		</Button>
	</Block>
</AppPage>
