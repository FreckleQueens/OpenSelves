<script lang="ts">
	import ErrorIcon from "$lib/components/icons/ErrorIcon.svelte";
	import { type FormValidationState, bindNativeInputValidation } from "$lib/forms";
	import { Card } from "konsta/svelte";
	import { type Snippet } from "svelte";

	let {
		children,
		formState = $bindable(),
	}: { children: Snippet; formState: FormValidationState } = $props();

	let inputsContainer: HTMLElement;
	bindNativeInputValidation(() => inputsContainer, formState);
</script>

<div bind:this={inputsContainer}>
	{@render children()}
</div>

{#if formState.generalError}
	<Card class="k-color-brand-red">
		<p class="flex items-center">
			<ErrorIcon class="text-xl mr-2 inline" />
			Error: {formState.generalError}
		</p>
	</Card>
{/if}
