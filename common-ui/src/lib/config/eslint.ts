import type { Config } from "@eslint/config-helpers";
import { includeIgnoreFile } from "@eslint/config-helpers";
import js from "@eslint/js";
import type { Config as SvelteConfig } from "@sveltejs/kit";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";

export function makeEslintConfig(gitignorePath: string, svelteConfig: SvelteConfig): Config[] {
	return defineConfig(
		includeIgnoreFile(gitignorePath),
		js.configs.recommended,
		...ts.configs.recommended,
		...svelte.configs.recommended,
		prettier,
		...svelte.configs.prettier,
		{
			languageOptions: { globals: { ...globals.browser, ...globals.node } },
			rules: {
				// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
				// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
				"no-undef": "off",
			},
		},
		{
			files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
			languageOptions: {
				parserOptions: {
					projectService: true,
					extraFileExtensions: [".svelte"],
					parser: ts.parser,
					svelteConfig,
				},
			},
		},
	);
}
