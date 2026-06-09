<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { apiState, refreshUserData, tryLogout } from "$lib/api.svelte";
	import { appState } from "$lib/appState.svelte.js";
	import AppPage from "$lib/components/AppPage.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DeleteIcon from "$lib/components/icons/DeleteIcon.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import LogoutIcon from "$lib/components/icons/LogoutIcon.svelte";
	import PasswordIcon from "$lib/components/icons/PasswordIcon.svelte";
	import ReloadIcon from "$lib/components/icons/ReloadIcon.svelte";
	import SaveIcon from "$lib/components/icons/SaveIcon.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		List,
		ListItem,
		Preloader,
	} from "konsta/svelte";
	import { onMount } from "svelte";

	import ResendVerificationEmail from "./ResendVerificationEmail.svelte";

	let storage: PersistentStorage | undefined = $state();
	let userId: string | undefined = $derived(storage?.getUserIdOptional());
	let showLogoutDialog: boolean = $state(false);
	let showWipeConfirmDialog: boolean = $state(false);

	requireAuth();
	onMount(() => {
		storage = PersistentStorage.getInstance();
	});

	$effect(() => {
		if (appState.syncWorkerOnline) {
			refreshUserData();
		}
	});

	async function doLogout(wipeData: boolean, forceWipe: boolean = false) {
		showWipeConfirmDialog = false;
		showLogoutDialog = false;

		let loggedOut: boolean;
		try {
			loggedOut = await tryLogout(wipeData, forceWipe, true);
		} catch (e) {
			throw new Error("Couldn't logout", { cause: e });
		}
		if (!loggedOut) {
			showWipeConfirmDialog = true;
			return;
		}

		await goto(resolve("/"));
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
						onclick={() => (showLogoutDialog = true)}
					>
						<LogoutIcon button before />
						Logout
					</Button>
				{/snippet}
			</ListItem>
		</List>
	</Block>
</AppPage>

<Dialog opened={showLogoutDialog} onBackdropClick={() => (showLogoutDialog = false)}>
	{#snippet title()}
		<span class="flex flex-row items-center">
			<DangerIcon before />
			Keep data?
		</span>
	{/snippet}

	{#snippet buttons()}
		<div class="flex flex-col gap-2 items-end">
			<DialogButton onclick={() => (showLogoutDialog = false)}>Cancel</DialogButton>
			<DialogButton id="logout-wipe-data-button" strong onclick={() => doLogout(true)}>
				<DeleteIcon button before />
				Wipe
			</DialogButton>
			<DialogButton strong onclick={() => doLogout(false)}>
				<SaveIcon button before />
				Keep
			</DialogButton>
		</div>
	{/snippet}

	<p>
		You should always choose "Wipe" if this device is used by other people or publicly
		accessible.
	</p>
	<p>
		Choosing "Keep" will keep your data stored in clear on device (no app-level encryption). It
		will be available to anyone with access to the app or the device's filesystem, even without
		entering your password.
	</p>
</Dialog>

<Dialog opened={showWipeConfirmDialog} onBackdropClick={() => (showWipeConfirmDialog = false)}>
	{#snippet title()}
		<span class="flex flex-row items-center">
			<DangerIcon before class="k-color-brand-red" />
			Discard unsynced data?
		</span>
	{/snippet}

	{#snippet buttons()}
		<div class="flex flex-col gap-2 items-end">
			<DialogButton onclick={() => (showWipeConfirmDialog = false)}>Cancel</DialogButton>
			<DialogButton strong onclick={() => doLogout(true, true)} class="k-color-brand-red">
				<DeleteIcon button before />
				Discard unsynced data
			</DialogButton>
			<DialogButton strong onclick={() => doLogout(true)} class="k-color-brand-green">
				<ReloadIcon button before />
				Retry sync
			</DialogButton>
		</div>
	{/snippet}

	<p>Some changes could not be synced. Are you sure you want to discard unsynced changes?</p>
</Dialog>
