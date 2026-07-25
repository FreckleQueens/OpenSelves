import { makeSvelteConfig } from "openselves-common-ui/config";

// noinspection ES6PreferShortImport
import { i18nSveltePreprocessor } from "./build-tools/i18n-svelte-preprocessor.ts";

export default makeSvelteConfig(
	[i18nSveltePreprocessor],
	[
		"*",
		"/members/[subspaceId]",
		"/members/[subspaceId]/edit/[[memberId]]",
		"/members/[subspaceId]/front/edit/[[frontId]]",
		"/members/[subspaceId]/front/history",
	],
);
