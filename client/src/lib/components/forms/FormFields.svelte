<script lang="ts">
	import Captcha from "$lib/components/Captcha.svelte";
	import type { CaptchaAction, CaptchaController } from "$lib/components/captcha";
	import ErrorIcon from "$lib/components/icons/ErrorIcon.svelte";
	import {
		type FormValidationState,
		type OSFormData,
		bindNativeInputValidation,
	} from "$lib/forms";
	import { Card } from "konsta/svelte";
	import { type Snippet } from "svelte";

	let {
		children,
		formState = $bindable(),
		captcha = false,
		captchaAction,
		captchaActionValue = $bindable(),
	}: {
		children: Snippet;
		formState: FormValidationState | OSFormData;
		captcha?: boolean;
		captchaAction?: CaptchaAction;
		captchaActionValue?: string;
	} = $props();
	let captchaController: CaptchaController | undefined = $state();

	let inputsContainer: HTMLElement;
	$effect(() => {
		if (formState) {
			bindNativeInputValidation(() => inputsContainer, formState);
		}
	});

	$effect(() => {
		if (!formState || !isFullFormState(formState)) {
			return;
		}

		if (captcha && captchaController) {
			formState.beforeSubmit = async () => {
				if (!captchaController) {
					throw new Error("captchaController not bound");
				}

				formState.workingStatus = t("Solving captcha...");
				captchaController.verify();
				return new Promise((resolve) => {
					captchaController?.onSolved((result: string | undefined) => {
						formState.workingStatus = undefined;
						resolve(!!result);
					});
				});
			};
		} else {
			formState.beforeSubmit = undefined;
		}
	});

	function isFullFormState(formState: FormValidationState): formState is OSFormData {
		return !!formState && typeof formState["data"] === "object";
	}
</script>

<div bind:this={inputsContainer}>
	{@render children()}
</div>

{#if captcha && isFullFormState(formState)}
	<Captcha
		bind:value={formState.data["captcha"]}
		bind:action={captchaAction}
		bind:actionValue={captchaActionValue}
		bind:captchaController
	/>
{/if}

{#if formState && formState.generalError}
	<Card class="form-global-error k-color-brand-red">
		<p class="flex items-center">
			<ErrorIcon class="text-xl mr-2 inline" />
			Error: {formState.generalError}
		</p>
	</Card>
{/if}
