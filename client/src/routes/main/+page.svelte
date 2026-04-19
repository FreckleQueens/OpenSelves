<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { call, handleLogout } from "$lib/api.svelte";
	import { appNetworkStatus } from "$lib/app-network-status.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import LogoutIcon from "$lib/components/icons/LogoutIcon.svelte";
	import { Storage } from "$lib/storage";
	import { Block, BlockTitle, Button, Preloader } from "konsta/svelte";
	import { onMount } from "svelte";

	let storage: Storage | undefined = $state();
	let storageKey: string | undefined = $derived(storage?.getKey());
	let user:
		| {
				id: string;
				email: string;
		  }
		| undefined = $state();

	onMount(async () => {
		storage = await Storage.getStorage();
		if (storage.isOffline()) {
			await goto(resolve("/"));
		}
	});

	$effect(() => {
		let online = appNetworkStatus.syncWorkerOnline;
		let userId = storageKey;
		(async () => {
			if (online && userId) {
				const response = await call(`/user/${userId}`);
				if (response) {
					if (!("id" in response && "email" in response)) {
						throw new Error("Bad server response");
					}
					user = {
						id: `${response.id}`,
						email: `${response.email}`,
					};
				}
			}
		})();
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
		{#if appNetworkStatus.syncWorkerOnline && user}
			<p>{t("You are logged in as user #{user.id}, {user.email}", user.id, user.email)}</p>
		{:else if !appNetworkStatus.syncWorkerOnline && storageKey}
			<p>{t("Offline - #{user.id}", storageKey)}</p>
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
