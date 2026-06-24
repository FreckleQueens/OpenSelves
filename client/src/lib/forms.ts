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
	isUnauthenticated?: boolean;
	onSuccess: (result: object) => Promise<unknown> | unknown;
	beforeSubmit?: () => Promise<boolean> | boolean;
	isWorking?: boolean;
	workingStatus?: string;
	submitWorkingStatus: string;
	disabled?: boolean;
};

export type OSFormProps = {
	formState?: OSFormData;
	formName: string;
	formData?: OSFormData["data"];
	endpoint: string;
	method?: OSFormData["method"];
	unauthenticated?: boolean;
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

		let result: { response: Response; responseBody: Record<string, unknown> } | undefined;
		try {
			result = await call(form.endpoint, {
				method: form.method || "POST",
				data: form.data,
				returnUnhandledResponses: true,
				isUnauthenticated: form.isUnauthenticated,
			});

			if (!result) {
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

		if (!result.response.ok) {
			if (typeof result.responseBody.message === "string") {
				form.generalError = result.responseBody.message;
			} else {
				throw new Error("Unhandled form response", { cause: result });
			}
			return;
		}
		await form.onSuccess(result.responseBody);
	} finally {
		form.isWorking = false;
	}
}
