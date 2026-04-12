<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { CallResult, call, handleLogout } from "$lib/api.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
	import LogoutIcon from "$lib/components/icons/LogoutIcon.svelte";
	import { Storage } from "$lib/storage";
	import { Block, BlockTitle, Button, Preloader } from "konsta/svelte";
	import { onMount } from "svelte";

	let user:
		| {
				id: string;
				email: string;
		  }
		| undefined = undefined;
	let offline = false;
	let storageKey: string | undefined = undefined;

	const load = (async () => {
		const storage = await Storage.getStorage();
		if (storage.isOffline()) {
			await goto(resolve("/"));
		}
	})();
	onMount(async () => {
		await load;
		const storage = await Storage.getStorage();
		if (storage.isOffline() || !navigator.onLine) {
			offline = true;
			storageKey = storage.getKey();
			return;
		}

		const response = await call(`/user/${storage.getKey()}`);
		if (response === CallResult.AUTH_FAILED) {
			await handleLogout();
		} else {
			if (!("id" in response && "email" in response)) {
				throw new Error("Bad server response");
			}
			user = {
				id: `${response.id}`,
				email: `${response.email}`,
			};
		}
	});

	const logoutButtonOnclick = async () => {
		const result = await call("/auth/logout", {
			method: "POST",
		});
		if (typeof result === "object") {
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
		{#if user}
			<p>{t("You are logged in as user #{user.id}, {user.email}", user.id, user.email)}</p>
		{:else if offline && storageKey}
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
