<script lang="ts">
	import type { AuthFormData } from "$lib";
	import { Card } from "konsta/svelte";
	import { type Snippet, onMount } from "svelte";

	let { children, formState }: { children: Snippet; formState: AuthFormData } = $props();

	let inputsContainer: HTMLElement;
	onMount(() => {
		const inputs = inputsContainer.querySelectorAll("input");
		for (const el of inputs) {
			el.addEventListener("input", (e) => {
				const target = e.target as HTMLInputElement;
				if (formState.errors[target.name]) {
					target.checkValidity();
					formState.errors[target.name] = target.validationMessage;
				}
			});
			el.addEventListener("invalid", (e) => {
				e.preventDefault();
				const target = e.target as HTMLInputElement;
				formState.errors[target.name] = target.validationMessage;
			});
		}
	});
</script>

<div bind:this={inputsContainer}>
	{@render children()}
</div>

{#if formState.generalError}
	<Card class="k-color-brand-red">
		<p>Error: {formState.generalError}</p>
	</Card>
{/if}
