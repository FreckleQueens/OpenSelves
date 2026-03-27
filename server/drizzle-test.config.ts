import "dotenv/config";

import { Config, defineConfig } from "drizzle-kit";

import { baseServerConfig } from "./drizzle.config";

if (typeof process.env.TEST_DB_URL !== "string") {
	throw new Error("TEST_DB_URL env variable is not defined");
}

export default defineConfig({
	...baseServerConfig,
	dbCredentials: {
		url: process.env.TEST_DB_URL,
	},
}) satisfies Config;
