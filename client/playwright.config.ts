import { defineConfig } from "@playwright/test";

export default defineConfig({
	webServer: [
		{ command: "PUBLIC_TEST_ENVIRONMENT=1 yarn build && yarn preview", port: 4173 },
		{
			command:
				"cd ../server && yarn build && INSECURE_EASY_CAPTCHA_FOR_TESTS=true yarn start:prod",
			port: 3000,
		},
	],
	testDir: "test",
	use: {
		baseURL: "http://127.0.0.1:4173",
	},
});
