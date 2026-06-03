<script lang="ts">
	import { scheduleOnlineCheck } from "$lib/api.svelte";
	import ApiReachableGate from "$lib/components/ApiReachableGate.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import FormFields from "$lib/components/forms/FormFields.svelte";
	import ContinueIcon from "$lib/components/icons/ContinueIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import { type OSFormData, submitOSForm } from "$lib/forms";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		List,
		Preloader,
	} from "konsta/svelte";
	import { type Snippet, onMount } from "svelte";

	let {
		children,
		loaded = $bindable(),
		formState = $bindable(),
		formName,
		endpoint,
		method,
		title,
		submitButtonText,
		successDialogTitle,
		successDialogContent,
		successDialogContinueButton,
		successDialogContinueAction,
	}: {
		children: Snippet;
		loaded: boolean;
		formState?: OSFormData;
		formName: string;
		endpoint: string;
		method: OSFormData["method"];
		title: string;
		submitButtonText: string;
		successDialogTitle: string;
		successDialogContent: string;
		successDialogContinueButton: string;
		successDialogContinueAction: () => Promise<void> | void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let _formState: OSFormData = $state({
		data: {},
		endpoint: endpoint,
		method: method,
		errors: {},
		generalError: "",
		name: formName,
		onSuccess() {
			successDialogOpen = true;
		},
	});
	formState = _formState;
	let isWorking = $state(false);
	let successDialogOpen = $state(false);

	onMount(async () => {
		scheduleOnlineCheck(0);
	});

	async function formOnSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!formState) {
			throw new Error("undefined formState");
		}

		isWorking = true;
		try {
			await submitOSForm(formState);
		} finally {
			isWorking = false;
		}
	}
</script>

<AppPage title="" showMenu={false} loading={!loaded} transparentNavbar>
	{#snippet navbarLeft()}
		<BackLink />
	{/snippet}

	<ApiReachableGate>
		<BlockTitle large>{title}</BlockTitle>
		<Block>
			<form onsubmit={formOnSubmit}>
				<FormFields bind:formState>
					<List>
						{@render children()}
					</List>
				</FormFields>

				<Block class="mt-0">
					<Button type="submit" tonal disabled={isWorking}>
						{#if isWorking}
							<Preloader />
						{:else}
							{submitButtonText}
						{/if}
					</Button>
				</Block>
			</form>
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
		<DialogButton strong onclick={successDialogContinueAction}>
			{successDialogContinueButton}
			<ContinueIcon button after />
		</DialogButton>
	{/snippet}

	<p>{successDialogContent}</p>
</Dialog>
