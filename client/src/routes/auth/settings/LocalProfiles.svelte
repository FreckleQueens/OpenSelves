<script lang="ts">
	import DatumCard from "$lib/components/DatumCard.svelte";
	import AppErrorIcon from "$lib/components/icons/AppErrorIcon.svelte";
	import CopyIcon from "$lib/components/icons/CopyIcon.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import SuccessIcon from "$lib/components/icons/SuccessIcon.svelte";
	import VerifiedIcon from "$lib/components/icons/VerifiedIcon.svelte";
	import type { OSIconProps } from "$lib/components/os-icon";
	import {
		type LocalProfile,
		type LocalProfileData,
		LocalProfileManager,
		getLocalProfiles,
		localProfilesState,
	} from "$lib/idb/local-profiles";
	import { Button, List, ListItem, Preloader } from "konsta/svelte";
	import type { Component } from "svelte";

	LocalProfileManager.getInstance().loadProfilesData();
	let localProfiles = $derived.by(getLocalProfiles);
	let showTechnicalData: string | undefined = $state();
	let copiedData: string | undefined = $state();

	const profileDataToDisplay: {
		key: keyof LocalProfile;
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

	async function copyData(profile: LocalProfileData, key: keyof LocalProfile, value: string) {
		await navigator.clipboard.writeText(value);
		copiedData = profile.userId + "." + key;
	}
</script>

{#if localProfilesState.loaded}
	<List>
		{#each localProfiles as profile (profile.handle)}
			<ListItem>
				<DatumCard title={profile.email || t("Local profile")} indentContent={false}>
					{#snippet status()}
						{#if profile.invalid}
							<AppErrorIcon class="text-xl text-brand-red" />
							Invalid data
						{/if}
					{/snippet}

					{#if showTechnicalData === profile.userId}
						<List class="-m-4">
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
