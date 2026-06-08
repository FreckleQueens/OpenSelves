<script lang="ts">
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { apiState, call, handleLogout, refreshUserData } from "$lib/api.svelte";
	import { appState } from "$lib/appState.svelte.js";
	import AppPage from "$lib/components/AppPage.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import LogoutIcon from "$lib/components/icons/LogoutIcon.svelte";
	import PasswordIcon from "$lib/components/icons/PasswordIcon.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import { Block, BlockTitle, Button, List, ListItem, Preloader } from "konsta/svelte";
	import { onMount } from "svelte";

	import ResendVerificationEmail from "./ResendVerificationEmail.svelte";

	let storage: PersistentStorage | undefined = $state();
	let userId: string | undefined = $derived(storage?.getUserIdOptional());

	requireAuth();
	onMount(() => {
		storage = PersistentStorage.getInstance();
	});

	$effect(() => {
		if (appState.syncWorkerOnline) {
			refreshUserData();
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

<AppPage title="" activeMenuItem={MenuItem.ACCOUNT}>
	<BlockTitle large>Account settings</BlockTitle>

	<BlockTitle medium>Status</BlockTitle>
	<Block strong>
		{#if appState.syncWorkerOnline && appState.userData}
			<p>
				{t(
					"You are logged in as user #{user.id}, {user.email} on the OpenSelves instance at {apiUrl}",
					appState.userData.id,
					appState.userData.email,
					apiState.url,
				)}
			</p>
		{:else if !appState.syncWorkerOnline && userId}
			<p>{t("Offline - #{user.id}", userId)}</p>
		{:else}
			<Preloader />
		{/if}
	</Block>

	<BlockTitle medium>Actions</BlockTitle>
	<Block strong>
		<List nested>
			<ResendVerificationEmail bind:user={appState.userData} />
			<ListItem>
				{#snippet text()}
					<Button tonal href={resolve("/account/change-email")}>
						<EmailIcon button before />
						Change email
					</Button>
				{/snippet}
			</ListItem>
			<ListItem>
				{#snippet text()}
					<Button tonal href={resolve("/account/change-password")}>
						<PasswordIcon button before />
						Change password
					</Button>
				{/snippet}
			</ListItem>
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
