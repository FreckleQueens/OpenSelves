<script lang="ts">
	import { MenuItem } from "$lib";
	import { tryLogout } from "$lib/api.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import DatumCard from "$lib/components/DatumCard.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DeleteIcon from "$lib/components/icons/DeleteIcon.svelte";
	import DownloadIcon from "$lib/components/icons/DownloadIcon.svelte";
	import LogoutIcon from "$lib/components/icons/LogoutIcon.svelte";
	import ReloadIcon from "$lib/components/icons/ReloadIcon.svelte";
	import SaveIcon from "$lib/components/icons/SaveIcon.svelte";
	import SyncIcon from "$lib/components/icons/SyncIcon.svelte";
	import SyncOffIcon from "$lib/components/icons/SyncOffIcon.svelte";
	import { Profile } from "$lib/idb/profiles";
	import { gotoHomeRoute, requireCurrentProfile } from "$lib/routing-utils";
	import { Block, BlockTitle, Button, Dialog, DialogButton, Preloader } from "konsta/svelte";

	let profile: Profile | undefined = $state();
	let showLogoutDialog: boolean = $state(false);
	let showWipeConfirmDialog: boolean = $state(false);
	let showTechnicalData: boolean = $state(false);

	requireCurrentProfile().then((loadedProfile) => {
		if (loadedProfile) {
			profile = loadedProfile;
		}
	});

	async function downloadRecoveryFile() {
		if (!profile) {
			throw new Error("profile not loaded");
		}

		await profile.downloadRecoveryFile();
	}

	async function doLogout(wipeData: boolean, forceWipe: boolean = false) {
		if (!profile) {
			throw new Error("Profile not loaded");
		}

		showWipeConfirmDialog = false;
		showLogoutDialog = false;

		let loggedOut: boolean;
		try {
			loggedOut = await tryLogout(profile, wipeData, forceWipe);
		} catch (e) {
			throw new Error("Couldn't logout", { cause: e });
		}
		if (!loggedOut) {
			showWipeConfirmDialog = true;
			return;
		}

		await gotoHomeRoute({
			user_logged_out: "1",
		});
	}
</script>

<AppPage title="" activeMenuItem={MenuItem.PROFILE} loading={!profile}>
	<BlockTitle large>Profile settings</BlockTitle>

	<DatumCard
		id="online-status"
		class={profile?.isSyncEnabled() && profile.isApiReachable() ? "online" : "offline"}
		title={t("Sync status")}
	>
		{#snippet status()}
			{#if profile?.isSyncEnabled()}
				<SyncIcon class="text-xl text-brand-green" />
				<span>Synchronized</span>
			{:else}
				<SyncOffIcon class="text-xl text-gray-500" />
				<span>Local-only</span>
			{/if}
		{/snippet}

		{#if profile}
			{#if showTechnicalData}
				<p>
					{t("Profile id: #{profile.id}", profile.id)}
				</p>
				{#if profile.isSyncEnabled()}
					<p>
						{t("Server URL: {apiUrl}", profile.api.url)}
					</p>
				{/if}
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
	</DatumCard>

	<Block>
		<Button tonal onclick={downloadRecoveryFile} class="mb-4">
			<DownloadIcon button before />
			Save recovery file
		</Button>
	</Block>

	<Block>
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
