import { call, scheduleOnlineCheck } from "$lib/api.svelte";
import { appState } from "$lib/appState.svelte";
import type { CaptchaAction } from "$lib/components/captcha";
import type { OSIconProps } from "$lib/components/os-icon";
import { type Component, onMount } from "svelte";

export type FormFieldsValidationState = {
	errors: Record<string, string>;
};

export type FormValidationState = FormFieldsValidationState & {
	generalError: string;
};

export type OSFormData = FormValidationState & {
	name: string;
	endpoint: string;
	method?: "GET" | "POST" | "PUT" | "PATCH";
	data: Record<string, string>;
	onSuccess: (result: object) => Promise<unknown> | unknown;
	beforeSubmit?: () => Promise<boolean> | boolean;
	isWorking?: boolean;
	workingStatus?: string;
	submitWorkingStatus: string;
};

export type OSFormProps = {
	formState?: OSFormData;
	formName: string;
	formData?: OSFormData["data"];
	endpoint: string;
	method?: OSFormData["method"];
	submitWorkingStatus: string;
	captcha?: boolean;
	captchaAction?: CaptchaAction;
	captchaActionValue?: string;
	submitButtonIcon?: Component<OSIconProps>;
	submitButtonText: string;
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

export async function submitOSForm(form: OSFormData) {
	form.isWorking = true;
	try {
		if (form.beforeSubmit && (await form.beforeSubmit()) !== true) {
			return;
		}

		form.workingStatus = form.submitWorkingStatus;

		let response: Response;
		try {
			response = await call(form.endpoint, {
				method: form.method || "POST",
				data: form.data,
				returnRawResponse: true,
			});

			if (!response) {
				appState.isApiReachable = false;
				scheduleOnlineCheck();
				return;
			}
		} catch (error) {
			console.trace(error);
			if (
				error &&
				typeof error === "object" &&
				"message" in error &&
				typeof error.message === "string"
			) {
				form.generalError = error.message;
			}
			return;
		}
		const result = await response.json();

		if (!response.ok) {
			form.generalError = result.message;
			return;
		}
		await form.onSuccess(result);
	} finally {
		form.isWorking = false;
	}
}
