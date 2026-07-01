import {
	BadRequestException,
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	PayloadTooLargeException,
	Post,
	Put,
	Req,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Request } from "express";
import {
	J2000_TO_UNIX_DIFFERENCE,
	type JsonFriendlyEntry,
	type JsonFriendlyEntryWithPayload,
	OPENSELVES_NAMESPACE_ID,
} from "openselves-common/willow";

import type { ConfigData } from "../config.data.js";
import { PullDto } from "./data/pull.dto.js";
import { PushDto } from "./data/push.dto.js";
import { SyncService } from "./sync.service.js";

@Controller("sync")
export class SyncController {
	constructor(
		private readonly configService: ConfigService<ConfigData>,
		private readonly syncService: SyncService,
	) {}

	@Put("push")
	public async push(@Body() pushDto: PushDto, @Req() request: Request) {
		if (!request.accessTokenPayload) {
			throw new UnauthorizedException();
		}

		const maxUploadSize = this.configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true });
		if (pushDto.entries.some((entry) => entry.payload.length > maxUploadSize)) {
			throw new PayloadTooLargeException(
				`One or more of the uploaded entries's payload is too large (max=${maxUploadSize})`,
			);
		}

		const userId = request.accessTokenPayload.user.id;
		await this.syncService.ingestEntries(userId, pushDto.entries);
		return {};
	}

	@Post("pull")
	@HttpCode(HttpStatus.OK)
	public async pull(@Body() pullDto: PullDto, @Req() request: Request) {
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
			if (date.getTime() < J2000_TO_UNIX_DIFFERENCE / 1000n) {
				throw new BadRequestException("Timestamp is too far in the past");
			}
		}

		const userId = request.accessTokenPayload.user.id;

		const { entries, timestamp } = await this.syncService.getEntriesFrom(
			userId,
			pullDto.timestamp,
		);

		const sanitizedEntries = entries.map(
			(entry): JsonFriendlyEntry | JsonFriendlyEntryWithPayload => {
				const jsonFriendlyEntry = {
					namespaceId: OPENSELVES_NAMESPACE_ID,
					subspaceId: entry.subspaceId,
					path: entry.path,
					timestamp: entry.timestamp.toString(),
					payloadLength: entry.payloadLength.toString(),
					payloadDigest: entry.payloadDigest,
				};
				if (entry.payload) {
					return {
						...jsonFriendlyEntry,
						payload: entry.payload.toString(),
					};
				}
				return jsonFriendlyEntry;
			},
		);

		return {
			entries: sanitizedEntries,
			timestamp,
		};
	}
}
