<script lang="ts">
	import { gotoHomeRoute } from "$lib/routing-utils";
	import { Block, Preloader } from "konsta/svelte";

	(async () => {
		await gotoHomeRoute({
			from_index_page: "1",
		});
	})();
</script>

<Block class="text-center">
	<Preloader />
</Block>
