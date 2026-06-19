<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import SingleFormPage from "$lib/components/forms/SingleFormPage.svelte";
	import PasswordIcon from "$lib/components/icons/PasswordIcon.svelte";
	import { type OSFormData } from "$lib/forms";
	import { requireGuest } from "$lib/routing-utils";
	import { ListInput } from "konsta/svelte";
	import { onMount } from "svelte";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	let formState: OSFormData | undefined = $state();
	let loaded = $state(false);

	const load = requireGuest();
	onMount(async () => {
		await load;
		loaded = true;
	});
</script>

<SingleFormPage
	bind:loaded
	bind:formState
	formName="recover-password"
	formData={{ token: params["token"] }}
	endpoint={"/user/" + params["userId"] + "/recover-password"}
	unauthenticated
	title={t("Change password")}
	submitButtonText={t("Change password")}
	submitWorkingStatus={t("Changing password...")}
	successDialogTitle={t("Password changed")}
	successDialogContent={t("You can now login with your new password.")}
	successDialogContinueButton={t("Go to login")}
	successDialogContinueAction={() => goto(resolve("/auth"))}
>
	{#if formState}
		<ListInput
			label={t("New password")}
			floatingLabel
			type="password"
			name="newPassword"
			bind:value={formState.data["newPassword"]}
			error={formState.errors["newPassword"] || ""}
			pattern=".{'{'}8,}"
			minlength={8}
			required
			autocomplete="new-password"
		>
			{#snippet media()}
				<PasswordIcon input />
			{/snippet}
		</ListInput>
	{/if}
</SingleFormPage>
