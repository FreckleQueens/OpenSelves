import { Body, Controller, HttpCode, HttpStatus, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { type Log, logs } from "openselves-common/db";

import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import { PushDto } from "./data/push.dto.js";
import { SyncService } from "./sync.service.js";

@Controller("sync")
export class SyncController {
	constructor(
		@InjectDb() private readonly db: DB,
		private readonly syncService: SyncService,
	) {}

	@Put("push")
	public async push(@Body() pushDto: PushDto, @Req() request: Request) {
		const outputLogs: Log[] = await this.syncService.reduceAndSaveLogs(
			pushDto.logs,
			request.accessTokenPayload.user.id,
		);
		return {
			logs: outputLogs,
		};
	}

	@Post("pull")
	@HttpCode(HttpStatus.OK)
	public async pull() {
		return {
			logs: await this.db.select().from(logs),
		};
	}
}
