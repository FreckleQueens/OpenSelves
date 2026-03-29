import "dotenv/config";

import { Config, defineConfig } from "drizzle-kit";

if (typeof process.env.DATABASE_URL !== "string") {
	throw new Error("DATABASE_URL env variable is not defined");
}

export const baseServerConfig: Config = defineConfig({
	out: "./drizzle",
	schema: "./node_modules/openselves-common/src/db/index.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL,
	},
});
export default baseServerConfig;
