<script lang="ts">
	import { Block, BlockTitle, Preloader } from "konsta/svelte";
	import { RawContributors } from "openselves-common-ui";

	import contributorsSrc from "../../../../CONTRIBUTORS?raw";
</script>

<BlockTitle>Contributors</BlockTitle>
<Block>
	<RawContributors {contributorsSrc}>
		<Preloader />
	</RawContributors>
</Block>
