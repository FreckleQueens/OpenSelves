import { onMount } from "svelte";

export type FormFieldsValidationState = {
	errors: Record<string, string>;
};

export type FormValidationState = FormFieldsValidationState & {
	generalError: string;
};

export type AuthFormData = FormValidationState & {
	name: string;
	endpoint: string;
	data: Record<string, string>;
	onSuccess: (result: object) => Promise<unknown> | unknown;
	autoVerifyCaptcha?: boolean;
};

export function bindNativeInputValidation(
	getInputsContainer: () => HTMLElement,
	validationState: FormFieldsValidationState,
) {
	onMount(() => {
		const inputsContainer = getInputsContainer();
		const inputs = inputsContainer.querySelectorAll("input");
		for (const el of inputs) {
			el.addEventListener("input", (e) => {
				const target = e.target as HTMLInputElement;
				if (validationState.errors[target.name]) {
					target.checkValidity();
					validationState.errors[target.name] = target.validationMessage;
				}
			});
			el.addEventListener("invalid", (e) => {
				e.preventDefault();
				const target = e.target as HTMLInputElement;
				validationState.errors[target.name] = target.validationMessage;
			});
		}
	});
}
