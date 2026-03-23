<script lang="ts">
	import type { AuthFormData } from "$lib";
	import AuthFields from "$lib/components/AuthFields.svelte";
	import Icon from "@iconify/svelte";
	import { BlockTitle, List, ListInput, useTheme } from "konsta/svelte";

	let { formState }: { formState: AuthFormData } = $props();
</script>

<AuthFields {formState}>
	<BlockTitle class="mt-0">Credentials</BlockTitle>
	<List>
		<ListInput
			label="Email"
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
				<Icon
					icon={useTheme() === "ios" ? "f7:at-alt" : "ic:round-alternate-email"}
					class="text-2xl"
				/>
			{/snippet}
		</ListInput>
		<ListInput
			label="Password"
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
				<Icon
					icon={useTheme() === "ios" ? "f7:lock-shield" : "ic:round-password"}
					class="text-2xl"
				/>
			{/snippet}
		</ListInput>
	</List>

	<BlockTitle>Authorization</BlockTitle>
	<List>
		<ListInput
			label="Registration password"
			floatingLabel
			info="This is provided by the website's administrator. It may be required to be allowed to create a new account."
			type="password"
			name="registrationPassword"
			bind:value={formState.data["registrationPassword"]}
			error={formState.errors["registrationPassword"] || ""}
			pattern=".{'{'}8,}"
			minlength={8}
			autocomplete="current-password"
		>
			{#snippet media()}
				<Icon icon={useTheme() === "ios" ? "f7:lock" : "ic:round-key"} class="text-2xl" />
			{/snippet}
		</ListInput>
	</List>
</AuthFields>
