import { defineConfig } from "@playwright/test";

export default defineConfig({
	webServer: [
		{ command: "yarn build && yarn dev", port: 5173 },
		{ command: "cd ../server && yarn dev", port: 3000 },
	],
	testDir: "test",
	use: {
		baseURL: "http://127.0.0.1:5173",
	},
});
