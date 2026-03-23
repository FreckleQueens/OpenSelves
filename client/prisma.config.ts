import "dotenv/config";

import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: "../common/prisma/schema.prisma",
	migrations: {
		path: "../common/prisma/migrations",
	},
});
