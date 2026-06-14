<script lang="ts">
	import { resolve } from "$app/paths";
	import FormFields from "$lib/components/forms/FormFields.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import PasswordIcon from "$lib/components/icons/PasswordIcon.svelte";
	import type { OSFormData } from "$lib/forms";
	import { BlockTitle, Link, List, ListInput, ListItem } from "konsta/svelte";

	let { formState = $bindable() }: { formState: OSFormData } = $props();
</script>

<FormFields bind:formState captcha>
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
		<ListItem>
			{#snippet after()}
				<Link
					href={resolve("/auth/recover-password") +
						(formState.data["email"] ? "?email=" + formState.data["email"] : "")}
				>
					Forgot password?
				</Link>
			{/snippet}
		</ListItem>
	</List>
</FormFields>
