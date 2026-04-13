<script lang="ts">
	import type { ClickEventHandler } from "$lib";
	import ArchivedIcon from "$lib/components/icons/ArchivedIcon.svelte";
	import PersonIcon from "$lib/components/icons/PersonIcon.svelte";
	import { Button, Card, Link } from "konsta/svelte";
	import type { Member } from "openselves-common/db";
	import type { Component } from "svelte";

	let {
		member,
		onClick,
		small = false,
		actions,
	}: {
		member: Member;
		onClick: ClickEventHandler;
		small?: boolean;
		actions?: { id: string; icon: Component; onClick: ClickEventHandler }[];
	} = $props();

	function onLinkClick(event: MouseEvent) {
		event.preventDefault();
		onClick(event);
	}
</script>

<div class="member-entry flex items-center" data-id={member.id} data-name={member.name}>
	<Link href="#" class="block flex-1" onclick={onLinkClick}>
		<Card raised>
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
			</div>
		</Card>
	</Link>

	{#if actions}
		{#each actions as action (action.id)}
			{@const Icon = action.icon}
			<Button
				class={`${action.id}-button mr-4 p-4 h-fit`}
				onclick={action.onClick}
				inline
				raised
				tonal
			>
				<Icon button />
			</Button>
		{/each}
	{/if}
</div>
