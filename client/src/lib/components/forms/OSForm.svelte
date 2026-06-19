<script lang="ts">
	import FormFields from "$lib/components/forms/FormFields.svelte";
	import SubmitButton from "$lib/components/forms/SubmitButton.svelte";
	import { type OSFormData, type OSFormProps, submitOSForm } from "$lib/forms";
	import { Block, List } from "konsta/svelte";
	import type { Snippet } from "svelte";

	let {
		children = $bindable(),
		formState = $bindable(),
		formData = {},
		endpoint,
		method,
		unauthenticated = false,
		formName,
		submitWorkingStatus,
		submitButtonIcon,
		submitButtonText,
		onSuccess,
		inline = false,
		...rest
	}: OSFormProps & {
		children?: Snippet;
		onSuccess: OSFormData["onSuccess"];
		inline?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	let _formState: OSFormData = $state({
		data: formData,
		endpoint,
		method,
		isUnauthenticated: unauthenticated,
		errors: {},
		generalError: "",
		name: formName,
		submitWorkingStatus,
		onSuccess,
	});
	// svelte-ignore state_referenced_locally
	formState = _formState;

	async function formOnSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!formState) {
			throw new Error("undefined formState");
		}

		await submitOSForm(formState);
	}
</script>

<form onsubmit={formOnSubmit}>
	<FormFields bind:formState={_formState} {...rest}>
		{#if children}
			<List>
				{@render children()}
			</List>
		{/if}
	</FormFields>

	<Block class={inline ? "m-0 p-0!" : ""}>
		<SubmitButton bind:formState={_formState}>
			{#if submitButtonIcon}
				{@const Icon = submitButtonIcon}
				<Icon button before />
			{/if}
			{submitButtonText}
		</SubmitButton>
	</Block>
</form>
