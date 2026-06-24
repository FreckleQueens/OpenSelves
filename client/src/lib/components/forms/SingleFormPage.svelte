<script lang="ts">
	import { scheduleOnlineCheck } from "$lib/api.svelte";
	import ApiReachableGate from "$lib/components/ApiReachableGate.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import OSForm from "$lib/components/forms/OSForm.svelte";
	import ContinueIcon from "$lib/components/icons/ContinueIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import { type OSFormProps } from "$lib/forms";
	import { Block, BlockTitle, Dialog, DialogButton } from "konsta/svelte";
	import { type Snippet } from "svelte";

	let {
		children,
		loaded,
		formState = $bindable(),
		title,
		successDialogTitle,
		successDialogContent,
		successDialogContinueButton,
		successDialogContinueAction,
		...rest
	}: OSFormProps & {
		children: Snippet;
		loaded: boolean;
		title: string;
		successDialogTitle: string;
		successDialogContent: string;
		successDialogContinueButton: string;
		successDialogContinueAction: () => Promise<void> | void;
	} = $props();

	let successDialogOpen = $state(false);

	$effect(() => {
		if (loaded) {
			scheduleOnlineCheck(0);
		}
	});
</script>

<AppPage title="" showMenu={false} loading={!loaded} transparentNavbar>
	{#snippet navbarLeft()}
		<BackLink />
	{/snippet}

	<ApiReachableGate>
		<BlockTitle large>{title}</BlockTitle>
		<Block>
			<OSForm
				bind:formState
				onSuccess={() => {
					successDialogOpen = true;
				}}
				{...rest}
			>
				{@render children()}
			</OSForm>
		</Block>
	</ApiReachableGate>
</AppPage>

<Dialog opened={successDialogOpen}>
	{#snippet title()}
		<span class="flex flex-row items-center">
			<InfoIcon before />
			{successDialogTitle}
		</span>
	{/snippet}

	{#snippet buttons()}
		<DialogButton
			id="success-dialog-continue-button"
			strong
			onclick={successDialogContinueAction}
		>
			{successDialogContinueButton}
			<ContinueIcon button after />
		</DialogButton>
	{/snippet}

	<p>{successDialogContent}</p>
</Dialog>
