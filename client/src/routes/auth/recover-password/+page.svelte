<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import SingleFormPage from "$lib/components/forms/SingleFormPage.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import { type OSFormData } from "$lib/forms";
	import { requireGuest } from "$lib/routing-utils";
	import { ListInput } from "konsta/svelte";
	import { onMount } from "svelte";

	const searchParams = new URLSearchParams(window.location.search);

	let formState: OSFormData | undefined = $state();
	let loaded = $state(false);

	const load = requireGuest();
	onMount(async () => {
		await load;
		loaded = true;
	});
</script>

<SingleFormPage
	{loaded}
	bind:formState
	formName="recover-password"
	formData={{
		email: searchParams.get("email") || "",
	}}
	endpoint="/user/recover-password"
	title={t("Forgot password")}
	submitButtonText={t("Send password recovery email")}
	submitWorkingStatus={t("Requesting password recovery...")}
	successDialogTitle={t("Email sent")}
	successDialogContent={t(
		"Please check your inbox for {emailAddress}. If you don't receive it in a few minutes, don't forget to check your spam.",
		formState?.data["email"] || "",
	)}
	successDialogContinueButton={t("Go to login")}
	successDialogContinueAction={() => goto(resolve("/auth"))}
	captcha
	captchaAction="sendEmail"
	captchaActionValue={formState?.data["email"] || ""}
>
	{#if formState}
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
	{/if}
</SingleFormPage>
