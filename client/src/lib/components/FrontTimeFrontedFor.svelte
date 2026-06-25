<script lang="ts">
	import ClockIcon from "$lib/components/icons/ClockIcon.svelte";
	import { localeState } from "$lib/i18n/i18n";
	import humanizeDuration from "humanize-duration";
	import type { Front } from "openselves-common/db";

	let { front }: { front: Front & { frontingFor: number } } = $props();
</script>

<time datetime={front.startedAt.toISOString()} class="flex items-center">
	<ClockIcon class="mr-1" />
	{humanizeDuration(front.frontingFor, {
		language: localeState.locale || undefined,
		round: true,
		fallbacks: ["en"],
		largest: 1,
	})}
</time>
