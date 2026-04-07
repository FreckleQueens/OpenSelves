<script lang="ts">
	import { apiState, setServerUrl } from "$lib/api.svelte";
	import { List, ListInput } from "konsta/svelte";
</script>

<List nested>
	<ListInput
		label={t("Server")}
		type="text"
		name="server"
		required
		onChange={(ev) => setServerUrl(ev.target.value)}
		bind:value={apiState.url}
	/>
</List>
