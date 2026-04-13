<script lang="ts">
	import type { ClickEventHandler } from "$lib";
	import ArchivedIcon from "$lib/components/icons/ArchivedIcon.svelte";
	import PersonIcon from "$lib/components/icons/PersonIcon.svelte";
	import { Button, Card } from "konsta/svelte";
	import type { Member } from "openselves-common/db";
	import type { Component, Snippet } from "svelte";

	let {
		member,
		onClick,
		small = false,
		actions,
		chips,
	}: {
		member: Member;
		onClick: ClickEventHandler;
		small?: boolean;
		actions?: { id: string; icon: Component; onClick: ClickEventHandler }[];
		chips?: Snippet;
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
		<Card raised class="my-4 mx-0! cursor-pointer" onclick={onLinkClick}>
			<div class="flex items-center">
				<PersonIcon class={(small ? "text-xl" : "text-3xl") + " mr-2"} />
				<div class="flex-1">
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

			{#if chips}
				<div class="mt-4">
					{@render chips()}
				</div>
			{/if}
		</Card>
	</div>
</div>
