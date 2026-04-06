<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { CallResult, MenuItem, call, handleLogout } from "$lib";
	import AppPage from "$lib/components/AppPage.svelte";
	import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
	import { Storage } from "$lib/storage";
	import Icon from "@iconify/svelte";
	import { Block, BlockTitle, Button, Preloader, useTheme } from "konsta/svelte";
	import { onMount } from "svelte";

	let user:
		| {
				id: string;
				email: string;
		  }
		| undefined = undefined;

	const load = (async () => {
		const storage = await Storage.getStorage();
		if (storage.isOffline()) {
			await goto(resolve("/"));
		}
	})();
	onMount(async () => {
		await load;
		const storage = await Storage.getStorage();
		if (storage.isOffline()) {
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
	<Block>
		<p class="text-2xl">Account settings</p>
	</Block>

	<BlockTitle medium>Status</BlockTitle>
	<Block strong inset>
		{#if user}
			<p>{t("You are logged in as user #{user.id}, {user.email}", user.id, user.email)}</p>
		{:else}
			<Preloader />
		{/if}
	</Block>

	<BlockTitle medium>Language</BlockTitle>
	<Block strong inset>
		<LanguageSwitcher />
	</Block>

	<BlockTitle medium>Actions</BlockTitle>
	<Block strong inset>
		<Button tonal raised onclick={logoutButtonOnclick}>
			<Icon
				icon={useTheme() === "ios" ? "f7:square-arrow-left" : "ic:round-logout"}
				class="text-2xl mr-1"
			/>
			Logout
		</Button>
	</Block>
</AppPage>
