<script lang="ts">
	import type { FrontStatic } from "openselves-common/client";

	let {
		front,
		setFrontNote,
	}: {
		front: FrontStatic;
		setFrontNote?: (frontId: string, value: string) => Promise<void> | void;
	} = $props();
</script>

<div class="m-2 mt-0 mb-8 p-2 rounded-xl bg-md-light-surface-1 dark:bg-md-dark-surface-1">
	{#if setFrontNote}
		<textarea
			class="w-full p-1 min-h-8 rounded-xs field-sizing-content resize-none"
			placeholder={t("Note")}
			oninput={(ev) => setFrontNote?.(front.id, ev.currentTarget?.value)}
			>{front.note}</textarea
		>
	{:else}
		<div class="w-full p-1 min-h-8 rounded-xs whitespace-break-spaces">
			{front.note}
		</div>
	{/if}
</div>
