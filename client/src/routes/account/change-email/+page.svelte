<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import SingleFormPage from "$lib/components/forms/SingleFormPage.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import type { OSFormData } from "$lib/forms";
	import { requireAuth } from "$lib/routing-utils";
	import { ListInput } from "konsta/svelte";
	import { onMount } from "svelte";

	let formState: OSFormData | undefined = $state();

	let loaded = $state(false);
	let load = requireAuth();
	onMount(async () => {
		await load;
		loaded = true;
	});
</script>

<SingleFormPage
	{loaded}
	bind:formState
	formName="change-email"
	endpoint={"/user/" + PersistentStorage.getInstance().getUserId()}
	method="PATCH"
	title={t("Change email")}
	submitButtonText={t("Change email")}
	submitWorkingStatus={t("Requesting email change...")}
	successDialogTitle={t("Verification needed")}
	successDialogContent={t(
		"Please check your inbox for {emailAddress}. If you don't receive it in a few minutes, don't forget to check your spam.",
		formState?.data["email"] || "",
	)}
	successDialogContinueButton={t("Continue")}
	successDialogContinueAction={() => goto(resolve("/account"))}
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
