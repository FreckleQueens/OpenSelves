<script lang="ts">
	import DatumCard from "$lib/components/DatumCard.svelte";
	import CopyIcon from "$lib/components/icons/CopyIcon.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DeleteIcon from "$lib/components/icons/DeleteIcon.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import SuccessIcon from "$lib/components/icons/SuccessIcon.svelte";
	import SyncOffIcon from "$lib/components/icons/SyncOffIcon.svelte";
	import VerifiedIcon from "$lib/components/icons/VerifiedIcon.svelte";
	import type { OSIconProps } from "$lib/components/os-icon";
	import {
		type UserProfileData,
		UserProfileManager,
		getUserProfiles,
		userProfilesState,
	} from "$lib/idb/local-profiles";
	import type { UserProfile } from "$lib/idb/local-profiles/UserProfile";
	import { Button, Dialog, DialogButton, List, ListItem, Preloader } from "konsta/svelte";
	import type { Component } from "svelte";

	const userProfileManager = UserProfileManager.getInstance();

	let userProfiles = $derived.by(getUserProfiles);
	let showTechnicalData: string | undefined = $state();
	let copiedData: string | undefined = $state();
	let confirmWipeProfileDialogOpen: boolean = $state(false);
	let confirmWipeProfile: UserProfile | undefined = $state();

	const profileDataToDisplay: {
		key: keyof UserProfile;
		name: string;
		Icon: Component<OSIconProps>;
	}[] = [
		{
			key: "handle",
			name: t("Handle"),
			Icon: EmailIcon,
		},
		{
			key: "isEmailVerified",
			name: t("Verification status"),
			Icon: VerifiedIcon,
		},
	];

	async function copyData(profile: UserProfileData, key: keyof UserProfile, value: string) {
		await navigator.clipboard.writeText(value);
		copiedData = profile.userId + "." + key;
	}

	async function wipeProfile() {
		if (!confirmWipeProfile) {
			throw new Error("No profile selected for wiping");
		}

		await userProfileManager.wipeUserData(confirmWipeProfile, userProfiles);
		await userProfileManager.loadProfilesData();

		confirmWipeProfileDialogOpen = false;
	}
</script>

{#if userProfilesState.loaded}
	<List>
		{#each userProfiles as profile (profile.handle)}
			<ListItem>
				<DatumCard
					title={profile.onlineData.email || t("User profile")}
					indentContent={false}
				>
					{#snippet status()}
						{#if profile.offline}
							<SyncOffIcon class="text-xl text-gray-500" />
							Offline
						{/if}
					{/snippet}

					{#snippet actions()}
						<div class="m-4">
							<Button
								tonal
								class="k-color-brand-red"
								onclick={() => {
									confirmWipeProfile = profile;
									confirmWipeProfileDialogOpen = true;
								}}
							>
								Delete profile
								<DeleteIcon button after />
							</Button>
						</div>
					{/snippet}

					{#if showTechnicalData === profile.userId}
						<List>
							{#each profileDataToDisplay as { key, name, Icon } (key)}
								{@const value = profile[key]}
								{@const isString = typeof value === "string"}
								<ListItem
									link={isString}
									header={name}
									chevron={false}
									onclick={isString
										? () => copyData(profile, key, value)
										: undefined}
								>
									{#snippet media()}
										<Icon listItemMedia />
									{/snippet}

									{#snippet after()}
										{#if isString}
											Copy
											{#if copiedData === `${profile.userId}.${key}`}
												<SuccessIcon after class="text-brand-green" />
											{:else}
												<CopyIcon after />
											{/if}
										{/if}
									{/snippet}

									{#snippet title()}
										{#if typeof value === "string"}
											{value}
										{:else if typeof value === "boolean"}
											{value.toString()}
										{:else}
											No data
										{/if}
									{/snippet}
								</ListItem>
							{/each}
						</List>
					{:else}
						<Button
							clear
							small
							inline
							onclick={() => (showTechnicalData = profile.userId)}
						>
							Show technical data
						</Button>
					{/if}
				</DatumCard>
			</ListItem>
		{:else}
			<ListItem>No data</ListItem>
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
			confirmWipeProfile?.onlineData.email || "undefined",
		)}
	</p>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<p>{@html t("This action is <strong>irreversible</strong>.")}</p>
</Dialog>
