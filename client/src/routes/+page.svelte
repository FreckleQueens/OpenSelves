<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { USER_LANDED_STORAGE_KEY } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { appState } from "$lib/appState.svelte.js";
	import { Block, Preloader } from "konsta/svelte";

	(async () => {
		if (appState.isAuthenticated) {
			await goto(resolve("/front"));
		} else {
			if (await PersistentStorage.getInstance().getRaw(USER_LANDED_STORAGE_KEY)) {
				await goto(resolve("/auth"));
			} else {
				await goto(resolve("/land"));
			}
		}
	})();
</script>

<Block class="text-center">
	<Preloader />
</Block>
