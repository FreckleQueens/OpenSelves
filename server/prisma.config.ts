import "dotenv/config";

import { defineConfig } from "prisma/config";

if (!process.env["SHADOW_DATABASE_URL"]) {
	throw new Error("Missing SHADOW_DATABASE_URL environment variable");
}

export default defineConfig({
	schema: "../common/prisma/schema.prisma",
	migrations: {
		path: "../common/prisma/migrations",
		seed: "bun ../common/prisma/seed.ts",
	},
	datasource: {
		url: process.env["DATABASE_URL"],
		shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
	},
});
