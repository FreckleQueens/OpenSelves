<script lang="ts">
	import { Profile } from "$lib/idb/profiles";
	import { Block, Preloader } from "konsta/svelte";

	let { children } = $props();

	let profile: Profile = Profile.getCurrentProfile();
	let apiReachable = $derived(!!(profile.isSyncEnabled() && profile.isApiReachable()));
</script>

{#if apiReachable}
	{@render children()}
{:else}
	<Block class="text-center">
		{#if profile && profile.isSyncEnabled()}
			<div class="m-8">
				{t("Waiting for {apiState.url}...", profile.api.url)}
			</div>
		{/if}
		<Preloader />
	</Block>
{/if}
