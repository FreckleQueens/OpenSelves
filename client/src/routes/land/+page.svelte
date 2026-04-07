<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { USER_LANDED_STORAGE_KEY } from "$lib";
	import AppPage from "$lib/components/AppPage.svelte";
	import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
	import { Storage } from "$lib/storage";
	import Icon from "@iconify/svelte";
	import { Block, BlockTitle, Button, useTheme } from "konsta/svelte";

	async function goForward() {
		const client = await Storage.getStorage();
		await client.set(USER_LANDED_STORAGE_KEY, "1"); // truthy value
		await goto(resolve("/auth"));
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
			<Icon
				icon={useTheme() === "ios" ? "f7:" : "ic:round-arrow-forward"}
				class="text-2xl ml-1"
			/>
		</Button>
	</div>
</AppPage>
