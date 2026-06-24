import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import AutoImport from "unplugin-auto-import/vite";
import IconsResolver from "unplugin-icons/resolver";
import Icons from "unplugin-icons/vite";
import type { UserConfig } from "vite";

export function makeViteConfig(listenPort: number, additionalConfig?: UserConfig): UserConfig {
	return {
		plugins: [
			tailwindcss(),
			sveltekit(),
			AutoImport({
				resolvers: [
					IconsResolver({
						prefix: "Icon",
						extension: "svelte",
					}),
				],
			}),
			Icons({
				compiler: "svelte",
			}),
		],
		server: {
			host: "0.0.0.0",
			port: listenPort,
		},
		...additionalConfig,
	};
}
