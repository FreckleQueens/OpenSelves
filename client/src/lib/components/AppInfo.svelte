<script lang="ts">
	import { PUBLIC_APP_VERSION } from "$env/static/public";
	import { Block, BlockTitle } from "konsta/svelte";
</script>

<BlockTitle>App info</BlockTitle>
<Block>
	<p>{t("OpenSelves client version {PUBLIC_APP_VERSION}", PUBLIC_APP_VERSION)}</p>
</Block>
