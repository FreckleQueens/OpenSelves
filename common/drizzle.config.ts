import "dotenv/config";
import { Config, defineConfig } from "drizzle-kit";

export const commonConfig: Config = defineConfig({
	out: "./src/db/drizzle",
	schema: "./src/db/schema.ts",
	dialect: "postgresql",
});
export default commonConfig;
