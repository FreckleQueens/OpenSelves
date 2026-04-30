<script lang="ts">
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { appState } from "$lib/appState.svelte";
	import PersonIcon from "$lib/components/icons/PersonIcon.svelte";
	import { IDB } from "$lib/idb";
	import type { Attachment } from "$lib/idb/IDBAttachment";
	import type { Member } from "openselves-common/db";
	import { type Snippet, onMount } from "svelte";

	let {
		children = undefined,
		member,
		class: classNames,
		...restProps
	}: { children?: Snippet; member: Omit<Member, "userId">; class?: string } = $props();

	let attachments: Attachment[] = $state([]);

	let memberImageUrl = $derived.by(() => {
		if (member.image?.startsWith("attachment:")) {
			const data = member.image.slice("attachment:".length);
			if (data.startsWith("data:")) {
				return data;
			} else {
				return attachments.find((attachment) => attachment.id === data)?.dataUri;
			}
		}
		return member.image;
	});

	let showChildren = $state(false);

	onMount(async () => {
		if (!appState.isAuthenticated) {
			return;
		}

		const idb = IDB.getInstance();
		attachments = await idb.attachment.getByField(
			"userId",
			PersistentStorage.getInstance().getUserId(),
		);
	});
</script>

<svelte:window onclick={() => (showChildren = false)} />

<div
	class={`aspect-square flex items-center justify-center text-center overflow-hidden rounded-md${classNames ? " " + classNames : ""}`}
	onmouseenter={() => (showChildren = true)}
	onmouseleave={() => (showChildren = false)}
	onclick={(event) => {
		event.stopPropagation();
		showChildren = true;
	}}
	{...restProps}
>
	{#if memberImageUrl}
		<img
			src={memberImageUrl}
			alt={t("{member.name}'s profile picture", member.name)}
			class="w-full h-full object-cover"
		/>
	{:else}
		<PersonIcon
			iconProps={{ class: "w-full h-full object-cover" }}
			class="w-full h-full opacity-70"
		/>
	{/if}

	{#if showChildren}
		{@render children?.()}
	{/if}
</div>
