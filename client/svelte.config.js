import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { execSync } from "node:child_process";

// noinspection ES6PreferShortImport
import { i18nSveltePreprocessor } from "./build-tools/i18n-svelte-preprocessor.ts";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [
		i18nSveltePreprocessor,
		vitePreprocess({
			script: true,
		}),
	],
	kit: {
		adapter: adapter({
			pages: "build",
			assets: "build",
			fallback: "app.html",
			precompress: false,
			strict: true,
		}),
		experimental: {
			handleRenderingErrors: true,
		},
		paths: {
			relative: false,
		},
		version: {
			name: execSync("git rev-parse HEAD").toString().trim(),
		},
	},
};

export default config;
