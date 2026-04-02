import {
	BadRequestException,
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	Put,
	Req,
} from "@nestjs/common";
import type { Request } from "express";
import { type Log } from "openselves-common/db";

import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import { PullDto } from "./data/pull.dto.js";
import { PushDto } from "./data/push.dto.js";
import { SyncService } from "./sync.service.js";

export type ClientLog = Omit<Log, "userId" | "deletedId">;

@Controller("sync")
export class SyncController {
	constructor(
		@InjectDb() private readonly db: DB,
		private readonly syncService: SyncService,
	) {}

	@Put("push")
	public async push(@Body() pushDto: PushDto, @Req() request: Request) {
		let lastDate: Date | undefined = undefined;
		const idTracker: string[] = [];
		for (const log of pushDto.logs) {
			if (lastDate && log.executedAt.getTime() < lastDate.getTime()) {
				throw new BadRequestException("logs must be sorted by executedAt");
			}
			lastDate = log.executedAt;

			if (log.memberId) {
				if (log.operationType === "delete" && idTracker.includes(log.memberId)) {
					throw new BadRequestException(
						"Cannot delete record AND perform other operations in the same request",
					);
				}
				idTracker.push(log.memberId);
			}
		}

		await this.syncService.reduceAndSaveLogs(request.accessTokenPayload.user.id, pushDto.logs);
		return {};
	}

	@Post("pull")
	@HttpCode(HttpStatus.OK)
	public async pull(@Body() pullDto: PullDto, @Req() request: Request) {
		const userId = request.accessTokenPayload.user.id;

		let timestamp: number = 0;
		let logs: Log[] = [];
		if (pullDto.timestamp === "init") {
			const initialSync = await this.syncService.generateInitialSync(userId);
			timestamp = initialSync.timestamp;
			logs = initialSync.logs;
		} else {
			if (pullDto.timestamp < 0) {
				throw new BadRequestException("Invalid timestamp");
			}
			if (pullDto.timestamp > Date.now()) {
				throw new BadRequestException("timestamp is in the future");
			}

			const syncFrom = await this.syncService.getLogsFrom(userId, pullDto.timestamp);
			timestamp = syncFrom.timestamp;
			logs = syncFrom.logs;
		}

		return {
			timestamp,
			logs: this.formatOutputLogs(logs),
		};
	}

	private formatOutputLogs(rawLogs: Log[]): ClientLog[] {
		return rawLogs.map((log) => {
			const { userId, deletedId, ...newLog } = log;
			if (log.operationType === "delete") {
				newLog.memberId = (deletedId as string).split(".")[1];
			}
			const data = { ...(newLog.data as Record<string, unknown>) };
			delete data["createdAt"];
			delete data["updatedAt"];
			newLog.data = data;
			return newLog;
		});
	}
}
