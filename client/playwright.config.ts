import { defineConfig } from "@playwright/test";

export default defineConfig({
	webServer: [
		{ command: "PUBLIC_TEST_ENVIRONMENT=1 yarn build && yarn preview", port: 4173 },
		{ command: "mailpit", port: 1025 },
		{
			command:
				"cd ../server && yarn build && ACCESS_TOKEN_DURATION=4 REFRESH_TOKEN_SHORT_DURATION=10 INSECURE_EASY_CAPTCHA_FOR_TESTS=true CLIENT_PUBLIC_URL=http://127.0.0.1:4173 yarn start:prod",
			port: 3000,
			stdout: "pipe",
		},
	],
	testDir: "test",
	use: {
		baseURL: "http://127.0.0.1:4173",
	},
});
