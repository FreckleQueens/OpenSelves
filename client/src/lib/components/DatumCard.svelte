<script lang="ts">
	import { Card, List } from "konsta/svelte";
	import type { Snippet } from "svelte";

	let {
		id,
		class: classNames,
		title,
		status,
		children,
		actions,
		indentContent = true,
	}: {
		id?: string;
		class?: string;
		title: string;
		status?: Snippet;
		children?: Snippet;
		actions?: Snippet;
		indentContent?: boolean;
	} = $props();
</script>

<Card {id} class={classNames} outline>
	{#snippet header()}
		{#if status}
			<div class="float-end flex items-center gap-1">
				{@render status()}
			</div>
		{/if}

		<div class="text-xl font-medium text-md-light-primary dark:text-md-dark-primary">
			{title}
		</div>
	{/snippet}

	<div class="flex flex-wrap justify-center items-center gap-4">
		{#if children}
			<div class={"flex-1" + (indentContent ? " ps-safe-4" : "")}>
				{@render children()}
			</div>
		{/if}

		{#if actions}
			<List nested>
				{@render actions()}
			</List>
		{/if}
	</div>
</Card>
