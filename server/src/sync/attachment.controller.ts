import { type GetObjectCommandOutput, S3ServiceException } from "@aws-sdk/client-s3";
import { Controller, Get, Header, NotFoundException, Param, Req, Res } from "@nestjs/common";
import { type Request, type Response } from "express";
import { ReadStream } from "node:fs";

import { S3Service } from "./s3.service.js";

@Controller("attachment")
export class AttachmentController {
	constructor(private readonly s3Service: S3Service) {}

	@Get(":userId/:logId/:fieldName")
	@Header("Cache-Control", "max-age=31536000, private")
	public async getAttachment(
		@Req() request: Request,
		@Res() response: Response,
		@Param("userId") userId: string,
		@Param("logId") logId: string,
		@Param("fieldName") fieldName: string,
	) {
		if (userId !== request.accessTokenPayload?.user.id) {
			throw new NotFoundException();
		}

		const logAttachmentKey = `${userId}/${logId}/${fieldName}`;
		let commandOutput: GetObjectCommandOutput;
		try {
			commandOutput = await this.s3Service.getObject(logAttachmentKey, request);
		} catch (error) {
			if (error instanceof S3ServiceException) {
				switch (error.$metadata.httpStatusCode) {
					case 304:
						return response.status(304).send();
					case 404:
						throw new NotFoundException();
				}
			}
			throw error;
		}
		if (!commandOutput.Body) {
			throw new NotFoundException();
		}

		response.set("ETag", commandOutput.ETag);
		if (commandOutput.ContentType) {
			response.set("Content-Type", commandOutput.ContentType);
		}
		if (commandOutput.ContentLength) {
			response.set("Content-Length", commandOutput.ContentLength.toString());
		}
		if (commandOutput.ContentDisposition) {
			response.set("Content-Disposition", commandOutput.ContentDisposition);
		}

		return ReadStream.from(commandOutput.Body.transformToWebStream()).pipe(response);
	}
}
