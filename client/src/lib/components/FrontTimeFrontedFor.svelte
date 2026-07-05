<script lang="ts">
	import ClockIcon from "$lib/components/icons/ClockIcon.svelte";
	import { localeState } from "$lib/i18n/i18n";
	import humanizeDuration from "humanize-duration";
	import type { FrontStatic } from "openselves-common/client";
	import { onMount } from "svelte";

	let { front }: { front: FrontStatic } = $props();
	let now = $state(Date.now());
	let frontingFor = $derived(now - front.startedAt.getTime());

	onMount(() => {
		const interval = window.setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => window.clearInterval(interval);
	});
</script>

<time datetime={front.startedAt.toISOString()} class="flex items-center">
	<ClockIcon class="mr-1" />
	{humanizeDuration(frontingFor, {
		language: localeState.locale || undefined,
		round: true,
		fallbacks: ["en"],
		largest: 1,
	})}
</time>
