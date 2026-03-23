<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { MenuItem } from "$lib";
	import AppPage from "$lib/AppPage.svelte";
	import { IDB } from "$lib/idb";
	import { Storage } from "$lib/storage";
	import { Card, Fab, Link } from "konsta/svelte";
	import { onMount } from "svelte";

	import type { Member } from "../../generated/prisma/client/generated/browser";

	let members: Member[] = $state([]);

	onMount(async () => {
		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const client = await IDB.getClient();
		members = await client.member.findMany({
			where: { userId: userId },
			orderBy: { name: "asc" },
		});
	});

	async function addMemberButtonOnClick() {
		await goto(resolve("/members/edit/"));
	}
</script>

<AppPage activeMenuItem={MenuItem.MEMBERS}>
	<Fab
		class="fixed right-safe-4 bottom-safe-4 z-20 k-color-brand-primary"
		onclick={addMemberButtonOnClick}
	>
		{#snippet icon()}
			<p>+</p>
		{/snippet}
	</Fab>

	{#each members as member (member.id)}
		<Link href={`/members/edit/${member.id}`} class="block">
			<Card>
				<p>{member.name}</p>
				<p class="opacity-70">{member.pronouns}</p>
			</Card>
		</Link>
	{/each}
</AppPage>
