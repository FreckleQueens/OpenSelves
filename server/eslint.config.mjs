// @ts-check
import { defineConfig } from "eslint/config";
import commonConfig from "openselves-common/eslint.config.mjs";

export default defineConfig([
	...commonConfig,
	{
		files: ["**/*.e2e-spec.ts", "test/utils.ts"],
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
		},
	},
]);
