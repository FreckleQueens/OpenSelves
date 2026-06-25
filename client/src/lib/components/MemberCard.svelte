<script lang="ts">
	import type { ClickEventHandler } from "$lib";
	import MemberImage from "$lib/components/MemberImage.svelte";
	import ArchivedIcon from "$lib/components/icons/ArchivedIcon.svelte";
	import { Button, Card } from "konsta/svelte";
	import type { Member } from "openselves-common/db";
	import type { Component, Snippet } from "svelte";

	let {
		member,
		onClick,
		small = false,
		inline = false,
		class: classNames,
		actions,
		chips,
		secondaryActions,
		footer,
	}: {
		member?: Omit<Member, "userId">;
		onClick?: ClickEventHandler;
		small?: boolean;
		inline?: boolean;
		class?: string;
		actions?: { id: string; icon: Component; onClick: ClickEventHandler }[];
		chips?: Snippet;
		secondaryActions?: {
			id: string;
			onClick: ClickEventHandler;
			icon: Component;
		}[];
		footer?: Snippet;
	} = $props();

	function onLinkClick(event: MouseEvent) {
		event.preventDefault();
		onClick?.(event);
	}

	function onActionClick(event: MouseEvent, action: ClickEventHandler) {
		event.stopPropagation();
		event.preventDefault();
		action(event);
	}
</script>

<div
	class={`member-entry my-4${inline ? " my-0" : ""}${classNames ? ` ${classNames}` : ""}`}
	data-id={member?.id}
	data-name={member?.name}
>
	<div class="flex gap-4 items-center">
		<!-- TODO: touch ripple -->
		<Card
			class={`member-card my-0 mx-0! w-full${onClick ? " cursor-pointer" : ""}${inline ? ` bg-transparent! p-0! border-0! inline-card-container` : ""}`}
			outline
			onclick={onClick ? onLinkClick : undefined}
		>
			<div class={`flex items-center ${small ? "h-10" : "h-14"}`}>
				<div class="self-stretch mr-2 flex-0">
					<MemberImage
						class="h-full"
						round={small}
						imageContainerClass={inline || small ? "" : "rounded-xl"}
						{member}
					/>
				</div>

				<div class="flex-1 ml-1">
					<p>{member?.name || t("Unknown")}</p>
					{#if member && !small}
						<p class="opacity-70">{member.pronouns}</p>
					{/if}
				</div>
				{#if member && member.isArchived && !inline}
					<ArchivedIcon class="text-3xl opacity-75" />
				{/if}
			</div>
		</Card>

		{#if actions}
			{#each actions as action (action.id)}
				{@const Icon = action.icon}
				<Button
					class={`main-action-button shrink-0 ${action.id}-button p-4 h-fit`}
					onclick={(ev) => onActionClick(ev, action.onClick)}
					inline
					tonal
					raised
				>
					<Icon button />
				</Button>
			{/each}
		{/if}
	</div>

	<div class="px-2 overflow-hidden flex">
		{#if chips}
			<div class="chips flex gap-4 items-start">
				<div class="min-w-max p-1">
					{@render chips()}
				</div>
			</div>
		{/if}

		{#if secondaryActions}
			<div class="ml-auto inline-flex gap-2 py-2">
				{#each secondaryActions as action (action.id)}
					<Button
						class={`${action.id}-button p-2`}
						inline
						tonal
						raised
						onclick={(ev) => {
							ev.stopPropagation();
							return action.onClick(ev);
						}}
					>
						{@const Icon = action.icon}
						<Icon button />
					</Button>
				{/each}
			</div>
		{/if}
	</div>

	{#if footer}
		<div>
			{@render footer()}
		</div>
	{/if}
</div>

<style lang="scss">
	:global .member-entry .member-card > * {
		padding: calc(var(--spacing) * 2);
	}
	:global .member-entry .k-card.inline-card-container > * {
		padding: 0;
	}
</style>
