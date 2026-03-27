import { Global, Module } from "@nestjs/common";

import { DbService, dbProvider } from "./db.service.js";

@Global()
@Module({
	providers: [dbProvider, DbService],
	exports: [dbProvider],
})
export class DbModule {}
