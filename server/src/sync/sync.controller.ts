import * as fs from "node:fs";
import {
	BadRequestException,
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	InternalServerErrorException,
	ParseFilePipeBuilder,
	Post,
	Put,
	Req,
	UnauthorizedException,
	UploadedFiles,
	UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { type Request } from "express";
import { type Log } from "openselves-common/db";

import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import { PullDto } from "./data/pull.dto.js";
import { PushDto } from "./data/push.dto.js";
import { SyncService, syncedModels } from "./sync.service.js";

export type ClientLog = Omit<Log, "userId" | "deletedId" | "pushedAt">;

@Controller("sync")
export class SyncController {
	constructor(
		@InjectDb() private readonly db: DB,
		private readonly syncService: SyncService,
	) {}

	@Put("push")
	@UseInterceptors(FilesInterceptor("attachments[]"))
	public async push(
		@Body() pushDto: PushDto,
		@Req() request: Request,
		@UploadedFiles(
			new ParseFilePipeBuilder()
				.addFileTypeValidator({
					fileType: /^image\//,
					fallbackToMimetype: true,
				})
				.build({
					fileIsRequired: false,
				}),
		)
		attachments: Express.Multer.File[] = [],
	) {
		if (!request.accessTokenPayload) {
			throw new UnauthorizedException();
		}

		try {
			for (const attachment of attachments) {
				const log = pushDto.logs.find((log) =>
					log.data
						? Object.values(log.data).find(
								(val) =>
									typeof val === "string" &&
									val.startsWith("attachment:") &&
									val.split(":", 2)[1] === attachment.originalname,
							)
						: undefined,
				);
				if (!log) {
					throw new BadRequestException(
						"Attachment " + attachment.originalname + " isn't referenced in any log",
					);
				}
			}

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

			await this.syncService.reduceAndSaveLogs(
				request.accessTokenPayload.user.id,
				pushDto.logs,
				attachments,
			);
		} finally {
			for (const attachment of attachments) {
				await new Promise((resolve, reject) => {
					fs.unlink(attachment.path, (err) => {
						if (err) {
							reject(err);
						} else {
							resolve(null);
						}
					});
				});
			}
		}
		return {};
	}

	@Post("pull")
	@HttpCode(HttpStatus.OK)
	public async pull(@Body() pullDto: PullDto, @Req() request: Request) {
		if (!request.accessTokenPayload) {
			throw new UnauthorizedException();
		}

		const userId = request.accessTokenPayload.user.id;

		let timestamp: number;
		let logs: Log[];
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
			const { userId, deletedId, pushedAt, ...newLog } = log;
			if (log.operationType === "delete") {
				const [table, recordId] = (deletedId as string).split(".");
				const model = Object.values(syncedModels).find((model) => model.name === table);
				if (!model) {
					throw new InternalServerErrorException(
						"Got record of non-synced model " + table,
					);
				}
				newLog[model.modelIdLogKey] = recordId;
			}
			return newLog;
		});
	}
}
