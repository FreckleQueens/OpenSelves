import { localeState } from "$lib/i18n/i18n";
import type { AltchaWidgetElement } from "altcha";
import { type VerifyResult } from "altcha/types";
import Argon2idWorker from "altcha/workers/argon2id?worker";

export async function solveCaptcha(
	apiUrl: string,
	options?: {
		action?: string;
		actionValue?: string;
	},
): Promise<VerifyResult> {
	const captchaEl = document.createElement("altcha-widget");
	document.body.append(captchaEl);
	await import("altcha");

	const captchaInstance: AltchaWidgetElement | undefined = globalThis.$altcha.instances
		.values()
		.find((val) => val === captchaEl) as AltchaWidgetElement | undefined;
	if (!captchaInstance) {
		throw new Error("Captcha couldn't be loaded");
	}

	const actionPathSuffix = options?.action
		? `/${options.action}` + (options.actionValue ? `/${options.actionValue}` : "")
		: "";
	const challengeUrl = `${apiUrl}/captcha/challenge` + actionPathSuffix;

	globalThis.$altcha.algorithms.set("ARGON2ID", () => new Argon2idWorker());
	await captchaInstance.configure({
		name: "captcha",
		language: localeState.locale || undefined,
		workers: 4,
		retryOnOutOfMemoryError: true,
		hideLogo: true,
		hideFooter: true,
		humanInteractionSignature: false,
		display: "invisible",
		challenge: challengeUrl,
	});

	let result: VerifyResult | null;
	try {
		result = await captchaInstance.verify();
	} finally {
		document.body.removeChild(captchaEl);
	}

	if (!result) {
		throw new Error("Captcha solution not found", {
			cause: result,
		});
	}
	return result;
}
