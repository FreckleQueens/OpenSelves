<script lang="ts">
	import { scheduleOnlineCheck } from "$lib/api.svelte";
	import ApiReachableGate from "$lib/components/ApiReachableGate.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import Captcha from "$lib/components/Captcha.svelte";
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
		ListItem,
		Preloader,
	} from "konsta/svelte";
	import { type Snippet } from "svelte";

	let {
		children,
		loaded = $bindable(),
		formState = $bindable(),
		formName,
		formData = {},
		endpoint,
		method,
		title,
		submitButtonText,
		successDialogTitle,
		successDialogContent,
		successDialogContinueButton,
		successDialogContinueAction,
		captcha = false,
	}: {
		children: Snippet;
		loaded: boolean;
		formState?: OSFormData;
		formName: string;
		formData?: OSFormData["data"];
		endpoint: string;
		method?: OSFormData["method"];
		title: string;
		submitButtonText: string;
		successDialogTitle: string;
		successDialogContent: string;
		successDialogContinueButton: string;
		successDialogContinueAction: () => Promise<void> | void;
		captcha?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	let _formState: OSFormData = $state({
		data: formData,
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

	$effect(() => {
		if (loaded) {
			scheduleOnlineCheck(0);
		}
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

					{#if captcha}
						<List>
							<ListItem>
								{#snippet inner()}
									{#if formState}
										<Captcha
											bind:value={formState.data["captcha"]}
											autoVerify={formState.autoVerifyCaptcha}
										/>
									{/if}
								{/snippet}
							</ListItem>
						</List>
					{/if}
				</FormFields>

				<Block class="mt-0">
					<Button
						type="submit"
						tonal
						disabled={!formState ||
							(captcha && !formState.data["captcha"]) ||
							isWorking}
					>
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
