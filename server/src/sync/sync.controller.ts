import {
	BadRequestException,
	Body,
	Controller,
	Post,
	Put,
	Req,
	Res,
	UnauthorizedException,
	UseInterceptors,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Writable } from "node:stream";
import {
	type ByteString,
	Drop,
	type EntryWithPayload,
	OPENSELVES_NAMESPACE_ID,
	Timestamp,
} from "openselves-common/willow";

import { PullDto } from "./data/pull.dto.js";
import { PushInterceptor } from "./push.interceptor.js";
import { SyncService } from "./sync.service.js";

@Controller("sync")
export class SyncController {
	constructor(private readonly syncService: SyncService) {}

	@UseInterceptors(PushInterceptor)
	@Put("push")
	public push() {}

	@Post("pull")
	public async pull(
		@Body() pullDto: PullDto,
		@Req() request: Request,
		@Res() response: Response,
	) {
		if (!request.accessTokenPayload) {
			throw new UnauthorizedException();
		}

		if (pullDto.timestamp !== "") {
			let date: Date;
			try {
				date = new Date(pullDto.timestamp);
				// Cover both 0, negative and NaN timestamp
				if (!(date.getTime() > 0)) {
					// noinspection ExceptionCaughtLocallyJS
					throw new Error("Timestamp's date resolved to invalid unix timestamp", {
						cause: date,
					});
				}
			} catch (e) {
				throw new BadRequestException("Timestamp is invalid", { cause: e });
			}

			// Refuse timestamps from 10 minutes in the future
			if (date.getTime() - Date.now() > 10 * 60 * 1000) {
				throw new BadRequestException("Timestamp is too far in the future");
			}

			// Refuse timestamps before j2000 epoch
			if (date.getTime() < Timestamp.J2000_TO_UNIX_DIFFERENCE / 1000n) {
				throw new BadRequestException("Timestamp is too far in the past");
			}
		}

		const userId = request.accessTokenPayload.user.id;

		const { entries, timestamp } = await this.syncService.getEntriesFrom(
			userId,
			pullDto.subspaceId,
			pullDto.timestamp,
		);

		const sanitizedEntries: EntryWithPayload[] = entries.map((entry) => {
			return {
				namespaceId: OPENSELVES_NAMESPACE_ID,
				subspaceId: entry.subspaceId,
				path: entry.path,
				timestamp: entry.timestamp,
				payloadLength: entry.payloadLength,
				payloadDigest: entry.payloadDigest,
				payload: entry.payload,
			};
		});

		response.statusCode = 200;
		response.setHeader("X-OpenSelves-Pull-Timestamp", timestamp);
		response.setHeader("Transfer-Encoding", "chunked");
		response.setHeader("X-Content-Type-Options", "nosniff");
		response.contentType("application/octet-stream");

		const dropEncoder = Drop.encoder();
		await Promise.all([
			(async () => {
				const writer = dropEncoder.writable.getWriter();
				for (const entry of sanitizedEntries) {
					await writer.write(entry);
				}
				await writer.close();
			})(),
			dropEncoder.readable.pipeTo(Writable.toWeb(response) as WritableStream<ByteString>),
		]);
	}
}
