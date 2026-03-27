import "dotenv/config";

import { Config, defineConfig } from "drizzle-kit";
import { commonConfig } from "openselves-common/drizzle.config";

if (typeof process.env.DATABASE_URL !== "string") {
	throw new Error("DATABASE_URL env variable is not defined");
}

export const baseServerConfig: Config = defineConfig({
	...commonConfig,
	schema: "./node_modules/openselves-common/src/db/schema.ts",
	dbCredentials: {
		url: process.env.DATABASE_URL,
	},
});
export default baseServerConfig;
