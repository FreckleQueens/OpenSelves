<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY } from "$lib";
	import { Settings } from "$lib/Settings";
	import AppPage from "$lib/components/AppPage.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DismissIcon from "$lib/components/icons/DismissIcon.svelte";
	import PlusIcon from "$lib/components/icons/PlusIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import UploadIcon from "$lib/components/icons/UploadIcon.svelte";
	import { Profile } from "$lib/idb/profiles";
	import { requireNoCurrentProfile } from "$lib/routing-utils";
	import { Block, BlockTitle, Button, Link } from "konsta/svelte";
	import { onMount } from "svelte";

	import ProfileSelector from "./ProfileSelector.svelte";

	let warnForRemainingLocalData: boolean = $state(false);
	let importProfileInput: HTMLInputElement | undefined = $state();
	let importProfileFiles: FileList | undefined = $state();

	const load = requireNoCurrentProfile();
	let loaded = $state(false);
	onMount(async () => {
		await load;
		loaded = true;

		warnForRemainingLocalData = !!(await Settings.get(
			WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY,
		));
	});

	$effect(() => {
		if (!importProfileFiles) {
			return;
		}

		const file = importProfileFiles.item(0);
		if (!file) {
			return;
		}

		importProfile(file);
	});

	async function goToCreateProfile() {
		await goto(resolve("/profiles/edit"));
	}

	async function importProfile(file: File) {
		console.log(file);
		const importedProfile = Profile.importFromJson(await file.text());
		await importedProfile.save(true);
	}
</script>

<AppPage title="" showMenu={false} loading={!loaded} transparentNavbar>
	{#snippet navbarRight()}
		<Link href={resolve("/profiles/settings")} id="settings-link">
			<SettingsIcon button />
		</Link>
	{/snippet}

	{#if warnForRemainingLocalData}
		<Block strong inset class="k-color-brand-yellow flex items-center">
			<DangerIcon before />
			<span class="flex-1">
				Your data is still on this device. Anyone with access to the app or the device's
				filesystem can read and modify it.
				<br />
				To delete your data, click the "Edit" button on the corresponding profile below, got to
				the "Settings" tab and click the "Delete" button.
			</span>
			<Button
				clear
				rounded
				small
				inline
				class="p-2"
				onclick={async () => {
					await Profile.dismissWarnForRemainingLocalData();
					warnForRemainingLocalData = false;
				}}
			>
				<DismissIcon />
			</Button>
		</Block>
	{/if}

	<BlockTitle class="app-welcome-title flex justify-start text-4xl mb-8!">
		<img
			src="/logo_trans.svg"
			alt={t(
				"A stylized ampersand gradually orange to pink from top to bottom. It has two overlapping implicit heart shapes in it.",
			)}
			class="h-20 m-2"
		/>
		<div class="flex flex-col gap-2">
			<span>OpenSelves</span>
			<sup class="uppercase font-thin text-xs">Early access</sup>
		</div>
	</BlockTitle>

	<Block>
		<ProfileSelector />
	</Block>

	<Block>
		<Button tonal onclick={goToCreateProfile}>
			<PlusIcon button before />
			Create a new profile
		</Button>
	</Block>

	<Block>
		<input
			bind:this={importProfileInput}
			type="file"
			bind:files={importProfileFiles}
			class="hidden"
			accept="application/json"
		/>
		<Button tonal onclick={() => importProfileInput?.click()}>
			<UploadIcon button before />
			Import profile from recovery file
		</Button>
	</Block>
</AppPage>
