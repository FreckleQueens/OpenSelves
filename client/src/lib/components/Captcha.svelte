<script lang="ts">
	import "altcha";
	import type {} from "altcha/types/svelte";

	import { apiState } from "$lib/api.svelte";
	import { localeState } from "$lib/i18n/i18n";
	import type { AltchaWidgetElement } from "altcha";
	import type { State } from "altcha/types";
	import Argon2idWorker from "altcha/workers/argon2id?worker";
	import { onMount } from "svelte";

	let {
		// eslint-disable-next-line no-useless-assignment
		value = $bindable(),
		autoVerify = false,
	}: {
		value: string | undefined;
		autoVerify?: boolean;
	} = $props();

	let altchaWidget: AltchaWidgetElement | undefined = $state();

	onMount(() => {
		globalThis.$altcha.algorithms.set("ARGON2ID", () => new Argon2idWorker());
		globalThis.$altcha.defaults.set({
			name: "captcha",
			challenge: `${apiState.url}/captcha/challenge`,
			language: localeState.locale || undefined,
			workers: 8,
			retryOnOutOfMemoryError: true,
			hideLogo: true,
			hideFooter: true,
			humanInteractionSignature: false,
			auto: autoVerify ? "onload" : "off",
		});

		if (!altchaWidget) {
			throw new Error("Altcha Widget not bound");
		}
		altchaWidget.addEventListener("statechange", onStateChange);
	});

	const onStateChange: EventListener = (event: Event) => {
		const { payload, state } = (
			event as CustomEvent<{
				payload?: string;
				state: State;
			}>
		).detail;
		if (state === "verified" && payload) {
			value = JSON.parse(atob(payload));
		} else {
			value = undefined;
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
