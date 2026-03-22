<script lang="ts">
	import type { AuthFormData } from "$lib";
	import AuthFields from "$lib/components/AuthFields.svelte";
	import { BlockTitle, List, ListInput } from "konsta/svelte";

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
		/>
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
		/>
	</List>
</AuthFields>
