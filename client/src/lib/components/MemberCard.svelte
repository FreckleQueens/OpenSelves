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
		actions,
		chips,
		secondaryActions,
		footer,
	}: {
		member: Member;
		onClick: ClickEventHandler;
		small?: boolean;
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
		onClick(event);
	}

	function onActionClick(event: MouseEvent, action: ClickEventHandler) {
		event.stopPropagation();
		event.preventDefault();
		action(event);
	}
</script>

<div class="member-entry flex items-center" data-id={member.id} data-name={member.name}>
	<div class="flex-1">
		<!-- TODO: touch ripple -->
		<Card raised class="member-card my-4 mx-0! cursor-pointer" onclick={onLinkClick}>
			<div class={`flex items-center ${small ? "h-10" : "h-14"}`}>
				<div class="self-stretch mr-2 flex-0">
					<MemberImage class="h-full" {member} />
				</div>

				<div class="flex-1 ml-1">
					<p>{member.name}</p>
					{#if !small}
						<p class="opacity-70">{member.pronouns}</p>
					{/if}
				</div>
				{#if member.isArchived}
					<ArchivedIcon class="text-3xl opacity-75" />
				{/if}

				{#if actions}
					{#each actions as action (action.id)}
						{@const Icon = action.icon}
						<Button
							class={`${action.id}-button p-4 h-fit`}
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
				<div
					class="chips-and-secondary-actions flex flex-wrap-reverse gap-4 items-center pt-4"
				>
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
</div>

<style lang="scss">
	:global .member-entry:not(:has(.chips-and-secondary-actions)) .member-card > * {
		padding: calc(var(--spacing) * 2);
	}
</style>
