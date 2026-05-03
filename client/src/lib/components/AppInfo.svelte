<script lang="ts">
	import { Block, BlockTitle } from "konsta/svelte";
	import { API_VERSION } from "openselves-common";
</script>

<BlockTitle>App info</BlockTitle>
<Block>
	<p>{t("OpenSelves client version {VERSION}", API_VERSION)}</p>
</Block>
