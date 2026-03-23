<script lang="ts">
	import type { AuthFormData } from "$lib";
	import Icon from "@iconify/svelte";
	import { Card, useTheme } from "konsta/svelte";
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
		<p class="flex items-center">
			<Icon
				icon={useTheme() === "ios" ? "f7:exclamationmark-circle" : "ic:baseline-error"}
				class="text-2xl mr-2 inline"
			/>
			Error: {formState.generalError}
		</p>
	</Card>
{/if}
