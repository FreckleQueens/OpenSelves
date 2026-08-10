<script lang="ts">
	import { Api } from "$lib/api.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import ContinueIcon from "$lib/components/icons/ContinueIcon.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DownloadIcon from "$lib/components/icons/DownloadIcon.svelte";
	import SuccessIcon from "$lib/components/icons/SuccessIcon.svelte";
	import { Profile } from "$lib/idb/profiles";
	import { gotoHomeRoute, requireCurrentProfile } from "$lib/routing-utils";
	import { Block, BlockTitle, Button, Checkbox, List, ListItem, Preloader } from "konsta/svelte";

	let profile: Profile | undefined = $state();
	let isCreatingSubspace: boolean = $state(true);
	let isOpeningSession = $state(false);

	let recoveryFileWasDownloaded: boolean = $state(false);
	let recoveryFileDownloadedUserConfirm: boolean = $state(false);

	requireCurrentProfile().then((loadedProfile) => {
		if (loadedProfile) {
			profile = loadedProfile;
		}
	});

	$effect(() => {
		if (profile) {
			if (profile.ownSubspaces.length === 0) {
				profile.createOwnSubspace().then(() => {
					isCreatingSubspace = false;
				});
			} else {
				isCreatingSubspace = false;
			}
		}
	});

	async function downloadRecoveryFile() {
		if (!profile) {
			throw new Error("profile not loaded");
		}
		await profile.downloadRecoveryFile();
		recoveryFileWasDownloaded = true;
	}

	async function finishSetup() {
		isOpeningSession = true;
		try {
			if (profile && profile.isSyncEnabled()) {
				await Api.openSession(profile);
			}
		} finally {
			await gotoHomeRoute({ subspace_setup_finish: "1" });
		}
	}
</script>

<AppPage title="" showMenu={false}>
	<BlockTitle class="text-2xl justify-center">Welcome to OpenSelves!</BlockTitle>

	<BlockTitle class="text-xl">
		<p class="flex items-center">1. Create encryption keys</p>
	</BlockTitle>

	{#if isCreatingSubspace}
		<Block class="text-center">
			<Preloader />
		</Block>
	{:else}
		<Block class="text-center">
			<SuccessIcon class="text-2xl text-brand-green" />
		</Block>
	{/if}

	{#if !isCreatingSubspace}
		<BlockTitle class="text-xl">
			<p class="flex items-center">2. Recovery methods</p>
		</BlockTitle>
	{/if}

	{#if !isCreatingSubspace && !isOpeningSession}
		<Block class="text-lg">
			<p class="m-4">
				When synchronization is enabled, an encrypted copy of your data is kept on the
				server.
			</p>
			<p class="m-4">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html t(
					"If you lose access to this device or in the event your local data is deleted or corrupted, the only way to recover your data is by importing your <strong>recovery file</strong> on a new device.",
				)}
			</p>
			<p class="m-4 flex items-center">
				<DangerIcon class="text-brand-yellow" before /> Do not store your recovery file only on
				this device!
			</p>

			<Button
				tonal
				onclick={downloadRecoveryFile}
				class="mb-4"
				id="download-recovery-file-button"
			>
				<DownloadIcon button before />
				Save recovery file
			</Button>

			{#if recoveryFileWasDownloaded}
				<List>
					<ListItem label>
						{#snippet media()}
							<Checkbox
								id="confirm-checkbox"
								checked={recoveryFileDownloadedUserConfirm}
								onChange={() =>
									(recoveryFileDownloadedUserConfirm =
										!recoveryFileDownloadedUserConfirm)}
							/>
						{/snippet}

						{#snippet title()}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html t(
								"I have saved my recovery file to a safe location and I understand that <strong>losing this file could mean losing all my data</strong>.",
							)}
						{/snippet}
					</ListItem>
					<ListItem>
						<Button
							tonal
							onclick={finishSetup}
							id="continue-button"
							disabled={!recoveryFileDownloadedUserConfirm}
						>
							Continue <ContinueIcon button after />
						</Button>
					</ListItem>
				</List>
			{/if}
		</Block>
	{:else if !isCreatingSubspace && isOpeningSession}
		<Block class="text-center">
			<SuccessIcon class="text-2xl text-brand-green" />
		</Block>
	{/if}

	{#if !isCreatingSubspace && isOpeningSession}
		<BlockTitle class="text-xl">
			<p class="flex items-center">3. Connect to synchronization server</p>
		</BlockTitle>

		<Block class="text-center">
			<Preloader />
		</Block>
	{/if}
</AppPage>
