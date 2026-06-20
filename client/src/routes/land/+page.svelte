<script lang="ts">
	import { USER_LANDED_STORAGE_KEY } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import AppPage from "$lib/components/AppPage.svelte";
	import LanguageSwitcher from "$lib/components/forms/LanguageSwitcher.svelte";
	import ContinueIcon from "$lib/components/icons/ContinueIcon.svelte";
	import { gotoHomeRoute } from "$lib/routing-utils";
	import { Block, BlockTitle, Button } from "konsta/svelte";

	async function goForward() {
		const client = PersistentStorage.getInstance();
		await client.set(USER_LANDED_STORAGE_KEY, "1", true); // truthy value
		await gotoHomeRoute({
			landed: "1",
		});
	}
</script>

<AppPage title="" showMenu={false}>
	<div class="h-full flex flex-col items-center justify-center">
		<BlockTitle large class="inline text-center">What language do you prefer?</BlockTitle>

		<Block class="w-100">
			<LanguageSwitcher />
		</Block>

		<Button id="continue-button" class="w-auto" onClick={goForward}>
			Continue
			<ContinueIcon button after />
		</Button>
	</div>
</AppPage>
