<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { scheduleOnlineCheck } from "$lib/api.svelte";
	import ApiReachableGate from "$lib/components/ApiReachableGate.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import Captcha from "$lib/components/Captcha.svelte";
	import FormFields from "$lib/components/forms/FormFields.svelte";
	import ContinueIcon from "$lib/components/icons/ContinueIcon.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import { type OSFormData, submitOSForm } from "$lib/forms";
	import { requireGuest } from "$lib/routing-utils";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		List,
		ListInput,
		ListItem,
		Preloader,
	} from "konsta/svelte";
	import { onMount } from "svelte";

	const searchParams = new URLSearchParams(window.location.search);
	let formState: OSFormData = $state({
		data: {
			email: searchParams.get("email") || "",
		},
		endpoint: "/user/recover-password",
		errors: {},
		generalError: "",
		name: "recover-password",
		onSuccess() {
			successDialogOpen = true;
		},
	});
	let isWorking = $state(false);
	let successDialogOpen = $state(false);

	const load = requireGuest();
	let loaded = $state(false);
	onMount(async () => {
		await load;
		loaded = true;

		scheduleOnlineCheck(0);
	});

	async function formOnSubmit(event: SubmitEvent) {
		event.preventDefault();
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
		<BlockTitle large>Forgot password</BlockTitle>
		<Block>
			<form onsubmit={formOnSubmit}>
				<FormFields bind:formState>
					<List>
						<ListInput
							label={t("Email")}
							floatingLabel
							placeholder="alice@example.com"
							type="email"
							name="email"
							bind:value={formState.data["email"]}
							error={formState.errors["email"] || ""}
							pattern="^.+@.+\..{'{'}2,}$"
							required
						>
							{#snippet media()}
								<EmailIcon input />
							{/snippet}
						</ListInput>
					</List>

					<List>
						<ListItem>
							{#snippet inner()}
								<Captcha
									bind:value={formState.data["captcha"]}
									autoVerify={formState.autoVerifyCaptcha}
								/>
							{/snippet}
						</ListItem>
					</List>
				</FormFields>

				<Block class="mt-0">
					<Button type="submit" tonal disabled={!formState.data["captcha"] || isWorking}>
						{#if isWorking}
							<Preloader />
						{:else}
							Send password recovery email
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
			Email sent
		</span>
	{/snippet}

	{#snippet buttons()}
		<DialogButton strong onclick={() => goto(resolve("/auth"))}>
			Go to login <ContinueIcon button after />
		</DialogButton>
	{/snippet}

	<p>
		{t(
			"Please check your inbox for {emailAddress}. If you don't receive it in a few minutes, don't forget to check your spam.",
			formState.data["email"],
		)}
	</p>
</Dialog>
