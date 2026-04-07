<script lang="ts">
	import { DEFAULT_LOCALE, localeState, supportedLocales } from "$lib/i18n/i18n";
	import { setLocale } from "$lib/i18n/i18n-client";
	import Icon from "@iconify/svelte";
	import { List, ListInput, useTheme } from "konsta/svelte";
</script>

<List nested>
	<ListInput
		label={t("Language")}
		type="select"
		name="language"
		dropdown
		required
		onChange={(ev) => setLocale(ev.target.value)}
		value={localeState.locale || DEFAULT_LOCALE}
	>
		{#snippet media()}
			<Icon icon={useTheme() === "ios" ? "f7:globe" : "ic:round-language"} class="text-2xl" />
		{/snippet}
		{#each supportedLocales as locale (locale)}
			<option value={locale}>{locale}</option>
		{/each}
	</ListInput>
</List>
