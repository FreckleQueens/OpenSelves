<script lang="ts">
	import { Settings } from "$lib/Settings";
	import AppUpdateIcon from "$lib/components/icons/AppUpdateIcon.svelte";
	import DismissIcon from "$lib/components/icons/DismissIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import ReloadIcon from "$lib/components/icons/ReloadIcon.svelte";
	import { Profile } from "$lib/idb/profiles";
	import { Button, Checkbox, Dialog } from "konsta/svelte";
	import { API_VERSION } from "openselves-common";
	import { onMount } from "svelte";

	const DO_NOT_ASK_AGAIN_KEY = "appUpdatePromptDoNotAskAgainForVersion";
	const ALREADY_ASKED_KEY = "appUpdatePromptAlreadyAskedForVersion";

	let profile: Profile | undefined = $state();
	let canUpdate = $derived.by(() => {
		if (profile && profile.isSyncEnabled() && profile.api.mismatchedRemoteVersion) {
			const current = API_VERSION.split(".");
			const remote = profile.api.mismatchedRemoteVersion.split(".");
			if (current.length === remote.length) {
				for (let i = 0; i < remote.length; i++) {
					if (remote[i] > current[i]) {
						return true;
					}
					if (remote[i] < current[i]) {
						break;
					}
				}
			}
		}
		return false;
	});
	let canPrompt = $state(false);
	let showDialog: boolean = $derived(canUpdate && canPrompt);
	let alreadyAsked: boolean = $state(false);

	let doNotAskAgain: boolean = $state(false);

	onMount(async () => {
		if (!Profile.hasCurrentProfile()) {
			return;
		}

		profile = Profile.getCurrentProfile();
		if (profile && profile.isSyncEnabled()) {
			canPrompt =
				profile.api.mismatchedRemoteVersion !== (await Settings.get(DO_NOT_ASK_AGAIN_KEY));
			alreadyAsked =
				profile.api.mismatchedRemoteVersion === (await Settings.get(ALREADY_ASKED_KEY));
		}
	});

	async function reload() {
		window.location.reload();
	}

	async function close() {
		canPrompt = false;
		if (profile && profile.isSyncEnabled() && profile.api.mismatchedRemoteVersion) {
			await Settings.set(ALREADY_ASKED_KEY, profile.api.mismatchedRemoteVersion);
			if (doNotAskAgain) {
				await Settings.set(DO_NOT_ASK_AGAIN_KEY, profile.api.mismatchedRemoteVersion);
			}
		}
	}
</script>

<Dialog id="application-update-dialog" opened={showDialog} onBackdropClick={close}>
	{#snippet title()}
		<span class="flex items-center gap-2">
			<AppUpdateIcon />
			App Update
		</span>
	{/snippet}

	<p class="mb-4">
		{t(
			"({LOCAL_VERSION} => {REMOTE_VERSION})",
			API_VERSION,
			(profile?.isSyncEnabled() && profile.api.mismatchedRemoteVersion) || "undefined",
		)}
	</p>

	<p>The server was updated to a more recent version. Do you want to try to update the app?</p>

	{#if alreadyAsked}
		<p class="mt-4 flex items-center">
			<InfoIcon before /> If this dialog keeps appearing, try to restart the app.
		</p>
	{/if}

	<p class="mt-4">
		<label>
			<Checkbox bind:checked={doNotAskAgain} class="p-2" />
			Don't ask again for this version
		</label>
	</p>

	{#snippet buttons()}
		<Button class="k-color-brand-red" onclick={close}>
			<DismissIcon button before />
			Dismiss
		</Button>
		<Button class="k-color-brand-primary" onclick={reload}>
			<ReloadIcon button before />
			Reload
		</Button>
	{/snippet}
</Dialog>
