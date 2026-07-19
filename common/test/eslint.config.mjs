import { defineConfig } from "eslint/config";
import globals from "globals";

import baseConfig from "../eslint.config.mjs";

export default defineConfig([
	...baseConfig,
	{
		languageOptions: {
			globals: {
				...globals.jest,
			},
		},
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-floating-promises": "off",
		},
	},
]);
