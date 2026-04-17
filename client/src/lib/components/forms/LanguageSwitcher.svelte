<script lang="ts">
	import LanguageIcon from "$lib/components/icons/LanguageIcon.svelte";
	import { DEFAULT_LOCALE, localeState, supportedLocales } from "$lib/i18n/i18n";
	import { setLocale } from "$lib/i18n/i18n-client";
	import { List, ListInput } from "konsta/svelte";
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
			<LanguageIcon input />
		{/snippet}

		{#each supportedLocales as locale (locale)}
			<option value={locale}>{locale}</option>
		{/each}
	</ListInput>
</List>
