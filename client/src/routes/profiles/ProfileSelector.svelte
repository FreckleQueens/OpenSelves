<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import DatumCard from "$lib/components/DatumCard.svelte";
	import CopyIcon from "$lib/components/icons/CopyIcon.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DeleteIcon from "$lib/components/icons/DeleteIcon.svelte";
	import EditIcon from "$lib/components/icons/EditIcon.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import LoginIcon from "$lib/components/icons/LoginIcon.svelte";
	import SuccessIcon from "$lib/components/icons/SuccessIcon.svelte";
	import SyncIcon from "$lib/components/icons/SyncIcon.svelte";
	import SyncOffIcon from "$lib/components/icons/SyncOffIcon.svelte";
	import type { OSIconProps } from "$lib/components/os-icon.d";
	import { Profile, type ProfileData, profilesState } from "$lib/idb/profiles";
	import { gotoHomeRoute } from "$lib/routing-utils";
	import { Button, Dialog, DialogButton, List, ListItem, Preloader } from "konsta/svelte";
	import type { Component } from "svelte";

	let showTechnicalData: string | undefined = $state();
	let copiedData: string | undefined = $state();
	let confirmWipeProfileDialogOpen: boolean = $state(false);
	let confirmWipeProfile: ProfileData | undefined = $state();

	const profileDataToDisplay: {
		getValue: (profile: ProfileData) => string | undefined;
		name: string;
		Icon: Component<OSIconProps>;
	}[] = [
		{
			getValue: (profile) => profile.id,
			name: t("id"),
			Icon: EmailIcon,
		},
		{
			getValue: (profile) => profile.api?.url,
			name: t("Sync server url"),
			Icon: SyncIcon,
		},
	];

	async function copyData(profileData: ProfileData, index: number, value: string) {
		await navigator.clipboard.writeText(value);
		copiedData = profileData.id + "." + index;
	}

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
		{#each profilesState.data as profile (profile.id)}
			<ListItem>
				<DatumCard title={profile.name || t("Unnamed profile")} indentContent={false}>
					{#snippet status()}
						{#if profile.api}
							<SyncIcon class="text-xl text-brand-green" />
							Synced
						{:else}
							<SyncOffIcon class="text-xl text-gray-500" />
							Offline
						{/if}
					{/snippet}

					{#snippet actions()}
						<ListItem>
							{#snippet inner()}
								<Button
									clear
									onclick={async () => {
										await goto(resolve(`/profiles/edit/${profile.id}`));
									}}
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
										await Profile.setCurrentProfile(profile.id);
										await gotoHomeRoute({ logged_in: "1" });
									}}
								>
									<LoginIcon button before />
									Login
								</Button>
							{/snippet}
						</ListItem>
					{/snippet}

					{#if showTechnicalData === profile.id}
						<List>
							{#each profileDataToDisplay as { getValue, name, Icon }, index (index)}
								{@const value = getValue(profile)}
								{@const isString = typeof value === "string"}
								<ListItem
									link={isString}
									header={name}
									chevron={false}
									onclick={isString
										? () => copyData(profile, index, value)
										: undefined}
								>
									{#snippet media()}
										<Icon listItemMedia />
									{/snippet}

									{#snippet after()}
										{#if isString}
											Copy
											{#if copiedData === `${profile.id}.${index}`}
												<SuccessIcon after class="text-brand-green" />
											{:else}
												<CopyIcon after />
											{/if}
										{/if}
									{/snippet}

									{#snippet title()}
										{#if typeof value === "string"}
											{value}
										{:else}
											No data
										{/if}
									{/snippet}
								</ListItem>
							{/each}
						</List>
					{:else}
						<Button clear small inline onclick={() => (showTechnicalData = profile.id)}>
							Show technical data
						</Button>
					{/if}
				</DatumCard>
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
