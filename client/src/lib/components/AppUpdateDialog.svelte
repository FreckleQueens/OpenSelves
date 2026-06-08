<script lang="ts">
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { apiState } from "$lib/api.svelte";
	import AppUpdateIcon from "$lib/components/icons/AppUpdateIcon.svelte";
	import DismissIcon from "$lib/components/icons/DismissIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import ReloadIcon from "$lib/components/icons/ReloadIcon.svelte";
	import { Button, Checkbox, Dialog } from "konsta/svelte";
	import { API_VERSION } from "openselves-common";
	import { onMount } from "svelte";

	const DO_NOT_ASK_AGAIN_KEY = "appUpdatePromptDoNotAskAgainForVersion";
	const ALREADY_ASKED_KEY = "appUpdatePromptAlreadyAskedForVersion";
	const storage = PersistentStorage.getInstance();

	let canUpdate = $derived.by(() => {
		if (apiState.mismatchedRemoteVersion) {
			const current = API_VERSION.split(".");
			const remote = apiState.mismatchedRemoteVersion.split(".");
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
		canPrompt =
			apiState.mismatchedRemoteVersion !== (await storage.get(DO_NOT_ASK_AGAIN_KEY, true));
		alreadyAsked =
			apiState.mismatchedRemoteVersion === (await storage.get(ALREADY_ASKED_KEY, true));
	});

	async function reload() {
		window.location.reload();
	}

	async function close() {
		canPrompt = false;
		if (apiState.mismatchedRemoteVersion) {
			await storage.set(ALREADY_ASKED_KEY, apiState.mismatchedRemoteVersion, true);
			if (doNotAskAgain) {
				await storage.set(DO_NOT_ASK_AGAIN_KEY, apiState.mismatchedRemoteVersion, true);
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
			apiState.mismatchedRemoteVersion || "undefined",
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
