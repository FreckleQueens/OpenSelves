<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DeleteIcon from "$lib/components/icons/DeleteIcon.svelte";
	import EditIcon from "$lib/components/icons/EditIcon.svelte";
	import LoginIcon from "$lib/components/icons/LoginIcon.svelte";
	import { Profile, type ProfileData, profilesState } from "$lib/idb/profiles";
	import { gotoHomeRoute } from "$lib/routing-utils";
	import { Button, Dialog, DialogButton, List, ListItem, Preloader } from "konsta/svelte";

	import ProfileCard from "./ProfileCard.svelte";

	let showTechnicalData: string | undefined = $state();
	let confirmWipeProfileDialogOpen: boolean = $state(false);
	let confirmWipeProfile: ProfileData | undefined = $state();

	async function wipeProfile() {
		if (!confirmWipeProfile) {
			throw new Error("No profile selected for wiping");
		}

		await Profile.wipeProfileData(confirmWipeProfile.id);

		confirmWipeProfileDialogOpen = false;
	}
</script>

{#if profilesState.loaded}
	<List>
		{#each profilesState.data as profileData (profileData.id)}
			<ListItem>
				<ProfileCard {profileData} bind:showTechnicalData>
					<ListItem>
						{#snippet inner()}
							<Button
								clear
								onclick={async () => {
									await goto(resolve(`/profiles/edit/${profileData.id}`));
								}}
								class="edit-button"
							>
								<EditIcon button before />
								Edit
							</Button>
						{/snippet}
					</ListItem>

					<ListItem>
						{#snippet inner()}
							<Button
								tonal
								onclick={async () => {
									await Profile.setCurrentProfile(profileData.id);
									await gotoHomeRoute({ logged_in: "1" });
								}}
								class="login-button"
							>
								<LoginIcon button before />
								Login
							</Button>
						{/snippet}
					</ListItem>
				</ProfileCard>
			</ListItem>
		{:else}
			<ListItem>No profile on device</ListItem>
		{/each}
	</List>
{:else}
	<Preloader />
{/if}

<Dialog
	opened={!!confirmWipeProfile && confirmWipeProfileDialogOpen}
	onBackdropClick={() => (confirmWipeProfileDialogOpen = false)}
>
	{#snippet title()}
		<span class="flex items-center">
			<DangerIcon before class="text-brand-red" />
			Delete profile
		</span>
	{/snippet}

	{#snippet buttons()}
		<DialogButton onclick={() => (confirmWipeProfileDialogOpen = false)}>Cancel</DialogButton>
		<DialogButton strong class="k-color-brand-red" onclick={() => wipeProfile()}>
			<DeleteIcon button before />
			Delete profile
		</DialogButton>
	{/snippet}

	<p>
		{t(
			"This will delete the profile for {email} and all associated data.",
			confirmWipeProfile?.name || "undefined",
		)}
	</p>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<p>{@html t("This action is <strong>irreversible</strong>.")}</p>
</Dialog>
