<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { USER_LANDED_STORAGE_KEY } from "$lib";
	import { Storage } from "$lib/storage";
	import { Block, Preloader } from "konsta/svelte";

	(async () => {
		const storage = await Storage.getStorage();
		if (storage.isOffline()) {
			if (await storage.get(USER_LANDED_STORAGE_KEY)) {
				await goto(resolve("/auth"));
			} else {
				await goto(resolve("/land"));
			}
		} else {
			await goto(resolve("/main"));
		}
	})();
</script>

<Block class="text-center">
	<Preloader />
</Block>
