<script lang="ts">
	import "altcha";

	import { apiState } from "$lib/api.svelte";
	import type { CaptchaAction, CaptchaController } from "$lib/components/captcha";
	import { localeState } from "$lib/i18n/i18n";
	import type { AltchaWidgetElement } from "altcha";
	import { State } from "altcha/types";
	import Argon2idWorker from "altcha/workers/argon2id?worker";
	import { onMount } from "svelte";

	let {
		action,
		actionValue,
		value = $bindable(),
		// eslint-disable-next-line no-useless-assignment
		captchaController = $bindable(),
	}: {
		value: string | undefined;
		action?: CaptchaAction;
		actionValue?: string;
		captchaController?: CaptchaController | undefined;
	} = $props();

	let altchaWidget: AltchaWidgetElement | undefined = $state();
	let onSolved: ((value: string | undefined) => void) | undefined = $state();

	onMount(() => {
		globalThis.$altcha.algorithms.set("ARGON2ID", () => new Argon2idWorker());
		globalThis.$altcha.defaults.set({
			name: "captcha",
			language: localeState.locale || undefined,
			workers: 4,
			retryOnOutOfMemoryError: true,
			hideLogo: true,
			hideFooter: true,
			humanInteractionSignature: false,
			display: "invisible",
		});

		if (!altchaWidget) {
			throw new Error("Altcha Widget not bound");
		}
		altchaWidget.addEventListener("statechange", onStateChange);
	});

	$effect(() => {
		const actionPathSuffix = action
			? `/${action}` + (actionValue ? `/${actionValue}` : "")
			: "";
		const challengeUrl = `${apiState.url}/captcha/challenge` + actionPathSuffix;
		globalThis.$altcha.defaults.set({
			challenge: challengeUrl,
		});
	});

	$effect(() => {
		if (altchaWidget) {
			captchaController = {
				verify() {
					if (!altchaWidget) {
						throw new Error("altchaWidget not bound");
					}
					altchaWidget.verify();
				},
				onSolved(callback: (value: string | undefined) => void) {
					onSolved = callback;
				},
			};
		} else {
			captchaController = undefined;
			onSolved = undefined;
		}
	});

	const onStateChange: EventListener = (event: Event) => {
		const { payload, state } = (
			event as CustomEvent<{
				payload?: string;
				state: State;
			}>
		).detail;
		if (state === State.VERIFIED && payload) {
			value = JSON.parse(atob(payload));
		} else {
			value = undefined;
		}

		if (onSolved && state !== State.VERIFYING) {
			onSolved(value);
		}
	};
</script>

<altcha-widget bind:this={altchaWidget} style="--altcha-max-width:100%; flex-shrink: 0;"
></altcha-widget>

<style>
	@media (prefers-color-scheme: dark) {
		altcha-widget {
			color-scheme: dark;
		}
	}
</style>
