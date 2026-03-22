<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { Storage } from "$lib/storage";
	import { Block, Preloader } from "konsta/svelte";

	(async () => {
		const storage = await Storage.getStorage();
		if (storage.isOffline()) {
			await goto(resolve("/auth"));
		} else {
			await goto(resolve("/main"));
		}
	})();
</script>

<Block class="text-center">
	<Preloader />
</Block>
