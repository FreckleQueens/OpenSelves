import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import AutoImport from "unplugin-auto-import/vite";
import IconsResolver from "unplugin-icons/resolver";
import Icons from "unplugin-icons/vite";
import type { UserConfig } from "vite";

export default {
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
		port: 5173,
	},
	preview: {
		proxy: {
			"^(/verify-email/.+/.+|/auth/recover-password/.+/.+)$": {
				target: "http://127.0.0.1:4173",
				rewrite() {
					return "/index.html";
				},
			},
		},
	},
} satisfies UserConfig;
