<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import SingleFormPage from "$lib/components/forms/SingleFormPage.svelte";
	import PasswordIcon from "$lib/components/icons/PasswordIcon.svelte";
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
	formName="change-password"
	endpoint={"/user/" + PersistentStorage.getInstance().getUserId()}
	method="PATCH"
	title={t("Change password")}
	submitButtonText={t("Change password")}
	submitWorkingStatus={t("Changing password...")}
	successDialogTitle={t("Password changed")}
	successDialogContent={t("Your password was changed successfully.")}
	successDialogContinueButton={t("Continue")}
	successDialogContinueAction={() => goto(resolve("/account"))}
	captcha
>
	{#if formState}
		<ListInput
			label={t("Current password")}
			floatingLabel
			type="password"
			name="oldPassword"
			bind:value={formState.data["oldPassword"]}
			error={formState.errors["oldPassword"] || ""}
			pattern=".{'{'}8,}"
			minlength={8}
			required
			autocomplete="current-password"
		>
			{#snippet media()}
				<PasswordIcon input />
			{/snippet}
		</ListInput>
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
