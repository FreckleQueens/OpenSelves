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
	<!-- TODO: touch ripple -->
	<Card
		class={`member-card my-0 mx-0! w-full${onClick ? " cursor-pointer" : ""}${inline ? ` bg-transparent! p-0! border-0! inline-card-container` : ""}`}
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

			{#if actions}
				{#each actions as action (action.id)}
					{@const Icon = action.icon}
					<Button
						class={`main-action-button ${action.id}-button p-4 h-fit`}
						onclick={(ev) => onActionClick(ev, action.onClick)}
						inline
						tonal
					>
						<Icon button />
					</Button>
				{/each}
			{/if}
		</div>

		{#if chips || secondaryActions}
			<div class="chips-and-secondary-actions flex flex-wrap-reverse gap-4 items-center pt-4">
				{#if chips}
					<div class="min-w-max">
						{@render chips()}
					</div>
				{/if}

				{#if secondaryActions}
					<div class="ml-auto inline-flex gap-2">
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
		{/if}

		{#if footer}
			<div>
				{@render footer()}
			</div>
		{/if}
	</Card>
</div>

<style lang="scss">
	:global .member-entry:not(:has(.chips-and-secondary-actions)) .member-card > * {
		padding: calc(var(--spacing) * 2);
	}
	:global .member-entry .k-card.inline-card-container > * {
		padding: 0;
	}
	:global .k-material .member-entry .k-card {
		border: 1px solid oklch(from var(--color-md-light-surface-1) calc(l * 0.975) c h);
		@media (prefers-color-scheme: dark) {
			border-color: oklch(from var(--color-md-dark-surface-1) calc(l * 1.2) c h);
		}
	}
</style>
