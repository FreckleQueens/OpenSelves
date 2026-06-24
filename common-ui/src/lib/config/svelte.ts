import adapter from "@sveltejs/adapter-static";
import type { Config, KitConfig } from "@sveltejs/kit";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { execSync } from "node:child_process";
import type { PreprocessorGroup } from "svelte/compiler";

export function makeSvelteConfig(
	additionalPreprocessors: Array<PreprocessorGroup> = [],
	prerenderEntries?: Required<KitConfig>["prerender"]["entries"],
): Config {
	return {
		preprocess: [
			...additionalPreprocessors,
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
			prerender: {
				entries: prerenderEntries || ["*"],
			},
			version: {
				name: execSync("git rev-parse HEAD").toString().trim(),
			},
		},
	};
}
