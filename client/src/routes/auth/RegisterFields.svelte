<script lang="ts">
	import { apiState } from "$lib/api.svelte.js";
	import FormFields from "$lib/components/forms/FormFields.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import PassphraseIcon from "$lib/components/icons/PassphraseIcon.svelte";
	import PasswordIcon from "$lib/components/icons/PasswordIcon.svelte";
	import type { OSFormData } from "$lib/forms";
	import { Block, BlockTitle, List, ListInput } from "konsta/svelte";

	let { formState = $bindable() }: { formState: OSFormData } = $props();
</script>

<FormFields
	bind:formState
	captcha
	captchaAction="sendEmail"
	bind:captchaActionValue={formState.data["email"]}
>
	<BlockTitle class="mt-0">Credentials</BlockTitle>
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
		<ListInput
			label={t("Password")}
			floatingLabel
			type="password"
			name="password"
			bind:value={formState.data["password"]}
			error={formState.errors["password"] || ""}
			pattern=".{'{'}8,}"
			minlength={8}
			required
			autocomplete="new-password"
		>
			{#snippet media()}
				<PasswordIcon input />
			{/snippet}
		</ListInput>
	</List>

	{#if apiState.status && !apiState.status.areRegistrationsOpen}
		<BlockTitle>Authorization</BlockTitle>
		<List>
			<ListInput
				label={t("Registration password")}
				floatingLabel
				info={t(
					"This is provided by the website's administrator. It may be required to be allowed to create a new account.",
				)}
				type="password"
				name="registrationPassword"
				bind:value={formState.data["registrationPassword"]}
				error={formState.errors["registrationPassword"] || ""}
				pattern=".{'{'}8,}"
				minlength={8}
				autocomplete="current-password"
			>
				{#snippet media()}
					<PassphraseIcon input />
				{/snippet}
			</ListInput>
		</List>
	{/if}

	<Block strong inset class="k-color-brand-yellow flex items-center">
		<DangerIcon before />
		<span class="flex-1">
			By creating an OpenSelves account, you acknowledge that during the testing period (Early
			access), the account may only be used for testing purposes only and that we DO NOT
			guarantee that your data is safe, NOR protected from software or hardware failure, NOR
			protected from being released publicly in case of a data breach.
			<br /><br />
			The service is provided for free and without any guarantee. Use it at your own risk.
		</span>
	</Block>
</FormFields>
