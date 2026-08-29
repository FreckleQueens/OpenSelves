<script lang="ts">
	import DatumCard from "$lib/components/DatumCard.svelte";
	import CopyIcon from "$lib/components/icons/CopyIcon.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import SuccessIcon from "$lib/components/icons/SuccessIcon.svelte";
	import SyncIcon from "$lib/components/icons/SyncIcon.svelte";
	import SyncOffIcon from "$lib/components/icons/SyncOffIcon.svelte";
	import type { OSIconProps } from "$lib/components/os-icon";
	import { type ProfileData } from "$lib/idb/profiles";
	import { Button, List, ListItem } from "konsta/svelte";
	import type { Component, Snippet } from "svelte";

	let copiedData: string | undefined = $state();

	let {
		children,
		profileData,
		showTechnicalData = $bindable(),
	}: {
		children?: Snippet;
		profileData: ProfileData;
		showTechnicalData: string | undefined;
	} = $props();

	let isSyncEnabled: boolean = $derived(!!profileData.api);

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
</script>

<div
	class="profile-card"
	data-profile-id={profileData.id}
	data-profile-name={profileData.name}
	data-profile-sync-enabled={isSyncEnabled}
>
	<DatumCard
		title={profileData.name || t("Unnamed profile")}
		indentContent={false}
		actions={children}
	>
		{#snippet status()}
			{#if isSyncEnabled}
				<SyncIcon class="text-xl text-brand-green" />
				Synced
			{:else}
				<SyncOffIcon class="text-xl text-gray-500" />
				Offline
			{/if}
		{/snippet}

		{#if showTechnicalData === profileData.id}
			<List>
				{#each profileDataToDisplay as { getValue, name, Icon }, index (index)}
					{@const value = getValue(profileData)}
					{@const isString = typeof value === "string"}
					<ListItem
						link={isString}
						header={name}
						chevron={false}
						onclick={isString ? () => copyData(profileData, index, value) : undefined}
					>
						{#snippet media()}
							<Icon listItemMedia />
						{/snippet}

						{#snippet after()}
							{#if isString}
								Copy
								{#if copiedData === `${profileData.id}.${index}`}
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
			<Button clear small inline onclick={() => (showTechnicalData = profileData.id)}>
				Show technical data
			</Button>
		{/if}
	</DatumCard>
</div>
