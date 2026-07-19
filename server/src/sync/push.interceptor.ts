import {
	BadRequestException,
	Injectable,
	type NestInterceptor,
	PayloadTooLargeException,
	UnauthorizedException,
} from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common/interfaces/features/execution-context.interface.js";
import type { CallHandler } from "@nestjs/common/interfaces/features/nest-interceptor.interface.js";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { ReadableStreamReadResult } from "node:stream/web";
import { ByteString, Drop, type EntryWithPayload } from "openselves-common/willow";
import { Observable } from "rxjs";

import type { ConfigData } from "../config.data.js";
import { SyncService } from "./sync.service.js";

@Injectable()
export class PushInterceptor implements NestInterceptor<void, void> {
	public constructor(
		private readonly configService: ConfigService<ConfigData>,
		private readonly syncService: SyncService,
	) {}

	public async intercept(
		context: ExecutionContext,
		next: CallHandler<void>,
	): Promise<Observable<void>> {
		const httpCtx = context.switchToHttp();
		const req = httpCtx.getRequest<Request>();
		const res = httpCtx.getResponse<Response>();

		if (!req.accessTokenPayload) {
			throw new UnauthorizedException();
		}

		const decoder = Drop.decoder();

		const writer = decoder.writable.getWriter();

		if (!req.readableLength) {
			throw new BadRequestException("No data sent");
		}

		const maxPayloadLength = this.configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true });

		const reader = decoder.readable.getReader();

		const entries: EntryWithPayload[] = [];
		await Promise.all([
			new Promise<void>((resolve, reject) => {
				const dataEventListener = (chunk: ByteString) => {
					(async () => {
						try {
							await writer.write(chunk);
						} catch (e) {
							req.off("data", dataEventListener);
							req.off("end", endEventListener);
							await writer.abort("error while writing");
							throw e;
						}
					})().catch((e) => {
						if (e instanceof Error) {
							reject(e);
						} else {
							reject(new Error("Error while writing chunk", { cause: e }));
						}
					});
				};
				const endEventListener = () => {
					(async () => {
						await writer.close();
						resolve();
					})().catch((e) => {
						if (e instanceof Error) {
							reject(e);
						} else {
							reject(new Error("Error while closing writer", { cause: e }));
						}
					});
				};
				req.on("data", dataEventListener);
				req.on("end", endEventListener);
				req.on("error", (err) => {
					(async () => {
						await writer.abort(err);
						reject(err);
					})().catch((e) => {
						if (e instanceof Error) {
							reject(e);
						} else {
							reject(new Error("Error during request", { cause: e }));
						}
					});
				});
			}),
			(async () => {
				while (true) {
					let result: ReadableStreamReadResult<EntryWithPayload>;
					try {
						result = await reader.read();
					} catch (e) {
						throw new BadRequestException("Drop decoding failed.", { cause: e });
					}

					if (result.value) {
						if (result.value.payloadLength.valueOf() > maxPayloadLength) {
							throw new PayloadTooLargeException(
								"Max payload size per entry is " +
									maxPayloadLength +
									", got " +
									result.value.payloadLength.valueOf(),
							);
						}
						entries.push(result.value);
					}

					if (result.done) {
						break;
					}
				}
			})(),
		]);

		if (entries.length === 0) {
			throw new BadRequestException("At least one entry must be present in the drop");
		}

		await this.syncService.ingestEntries(req.accessTokenPayload.user.id, entries);

		res.send({});

		return next.handle();
	}
}
