import { Controller, Get, NotFoundException, Param, Req, StreamableFile } from "@nestjs/common";
import type { StreamableFileOptions } from "@nestjs/common/file-stream/interfaces/index.js";
import { ReadStream } from "node:fs";

import { S3Service } from "./s3.service.js";
import { SyncService } from "./sync.service.js";

@Controller("attachment")
export class AttachmentController {
	constructor(
		private readonly s3Service: S3Service,
		private readonly syncService: SyncService,
	) {}

	@Get(":userId/:logId/:fieldName")
	public async getAttachment(
		@Req() request: Express.Request,
		@Param("userId") userId: string,
		@Param("logId") logId: string,
		@Param("fieldName") fieldName: string,
	) {
		if (userId !== request.accessTokenPayload.user.id) {
			throw new NotFoundException();
		}

		const logAttachmentKey = this.syncService.getLogAttachmentKey(userId, logId, fieldName);
		const commandOutput = await this.s3Service.getObject(logAttachmentKey);
		if (!commandOutput.Body) {
			throw new NotFoundException();
		}

		const options: StreamableFileOptions = {};
		if (commandOutput.ContentType) {
			options.type = commandOutput.ContentType;
		}
		if (commandOutput.ContentLength) {
			options.length = commandOutput.ContentLength;
		}
		return new StreamableFile(
			ReadStream.from(commandOutput.Body.transformToWebStream()),
			options,
		);
	}
}
