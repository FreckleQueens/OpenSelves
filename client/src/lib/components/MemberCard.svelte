<script lang="ts">
	import ArchivedIcon from "$lib/components/icons/ArchivedIcon.svelte";
	import PersonIcon from "$lib/components/icons/PersonIcon.svelte";
	import { Card, Link } from "konsta/svelte";
	import type { Member } from "openselves-common/db";

	let {
		member,
		onClick,
		small = false,
	}: {
		member: Member;
		onClick: (event: MouseEvent) => Promise<void> | void;
		small?: boolean;
	} = $props();

	function onLinkClick(event: MouseEvent) {
		event.preventDefault();
		onClick(event);
	}
</script>

<Link href="#" class="block" onclick={onLinkClick}>
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
