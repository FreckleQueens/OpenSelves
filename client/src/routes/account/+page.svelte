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
	import SyncIcon from "$lib/components/icons/SyncIcon.svelte";
	import SyncOffIcon from "$lib/components/icons/SyncOffIcon.svelte";
	import VerifiedIcon from "$lib/components/icons/VerifiedIcon.svelte";
	import { requireAuth } from "$lib/routing-utils";
	import { BlockTitle, Button, Dialog, DialogButton, ListItem, Preloader } from "konsta/svelte";
	import { onMount } from "svelte";

	import AccountCard from "./AccountCard.svelte";
	import ResendVerificationEmail from "./ResendVerificationEmail.svelte";

	let storage: PersistentStorage | undefined = $state();
	let userId: string | undefined = $derived(storage?.getUserIdOptional());
	let showLogoutDialog: boolean = $state(false);
	let showWipeConfirmDialog: boolean = $state(false);
	let showTechnicalData: boolean = $state(false);
	let userDataReady: boolean = $state(false);

	requireAuth();
	onMount(() => {
		storage = PersistentStorage.getInstance();
	});

	$effect(() => {
		if (appState.syncWorkerOnline) {
			userDataReady = false;
			refreshUserData().then(() => (userDataReady = true));
		} else {
			userDataReady = true;
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

	<AccountCard
		id="online-status"
		class={(appState.isApiReachable && appState.userData ? "online" : "offline") +
			(userDataReady ? " ready" : "")}
		title="Online account status"
	>
		{#snippet status()}
			{#if appState.isAuthenticated}
				<SyncIcon class="text-xl text-brand-green" />
				<span>Synchronized</span>
			{:else}
				<SyncOffIcon class="text-xl text-gray-500" />
				<span>Local-only</span>
			{/if}
		{/snippet}

		{#snippet actions()}
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
		{/snippet}

		{#if appState.userData || userId}
			{#if showTechnicalData}
				<p>
					{t("User id: #{user.id}", appState.userData?.id || userId || "")}
				</p>
				<p>
					{t("Server URL: {apiUrl}", apiState.url)}
				</p>
			{:else}
				<Button
					href="javascript: void(0);"
					onclick={() => (showTechnicalData = true)}
					inline
					clear
					small>Show technical data</Button
				>
			{/if}
		{:else}
			<Preloader />
		{/if}
	</AccountCard>

	{#if appState.userData}
		<AccountCard
			id="email-status"
			class={(appState.userData.isEmailVerified && !appState.userData.newEmailRequest
				? "verified"
				: "unverified") + (userDataReady ? " ready" : "")}
			title="Email"
		>
			{#snippet status()}
				{#if appState.userData && appState.userData.isEmailVerified && !appState.userData.newEmailRequest}
					<VerifiedIcon class="text-xl text-brand-green" />
					<span>Verified</span>
				{:else}
					<DangerIcon class="text-xl text-brand-yellow" />
					<span>Unverified</span>
				{/if}
			{/snippet}

			{#snippet actions()}
				<ResendVerificationEmail bind:user={appState.userData} />
				<ListItem>
					{#snippet text()}
						<Button tonal href={resolve("/account/change-email")}>
							<EmailIcon button before />
							Change email
						</Button>
					{/snippet}
				</ListItem>
			{/snippet}

			{appState.userData.newEmailRequest || appState.userData.email}
		</AccountCard>
	{/if}

	<AccountCard id="security" title="Security">
		{#snippet actions()}
			<ListItem>
				{#snippet text()}
					<Button tonal href={resolve("/account/change-password")}>
						<PasswordIcon button before />
						Change password
					</Button>
				{/snippet}
			</ListItem>
		{/snippet}
	</AccountCard>
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
