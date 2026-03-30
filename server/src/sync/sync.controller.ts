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
			request.accessTokenPayload.user.id,
			pushDto.logs,
		);
		return {
			logs: this.formatOutputLogs(outputLogs),
		};
	}

	@Post("pull")
	@HttpCode(HttpStatus.OK)
	public async pull() {
		return {
			logs: this.formatOutputLogs(await this.db.select().from(logs)),
		};
	}

	private formatOutputLogs(rawLogs: Log[]) {
		return rawLogs.map((log) => {
			if (log.operationType === "delete") {
				const { deletedId, ...newLog } = log;
				newLog.memberId = (deletedId as string).split(".")[1];
				return newLog;
			}
			return log;
		});
	}
}
