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
import { OPENSELVES_NAMESPACE_ID, readStream } from "openselves-common";
import {
	AuthorisedEntry,
	type AuthorisedEntryWithPayload,
	ByteString,
	Drop,
} from "openselves-common/willow";
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

		const maxPayloadLength = this.configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true });

		const decoder = Drop.decoder();

		const writer = decoder.writable.getWriter();

		let bytesReceived: number = 0;
		let stalledRequestCheckInterval: NodeJS.Timeout | undefined;
		let onRequestEnd: (() => void) | undefined;

		const entries: AuthorisedEntryWithPayload[] = [];
		await Promise.all([
			new Promise<void>((resolve, reject) => {
				const dataEventListener = (chunk: ByteString) => {
					bytesReceived += chunk.length;
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
						if (onRequestEnd) {
							onRequestEnd();
						}
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
			readStream(decoder.readable, {
				onValue: async (value) => {
					if (value.payloadLength.valueOf() > maxPayloadLength) {
						throw new PayloadTooLargeException(
							"Max payload size per entry is " +
								maxPayloadLength +
								", got " +
								value.payloadLength.valueOf(),
						);
					}
					if (!req.accessTokenPayload) {
						throw new Error("accessTokenPayload went missing");
					}
					if (!ByteString.equals(value.namespaceId, OPENSELVES_NAMESPACE_ID)) {
						throw new BadRequestException("Invalid namespaceId", {
							cause: {
								actual: value.namespaceId,
								expected: OPENSELVES_NAMESPACE_ID,
							},
						});
					}
					if (!(await AuthorisedEntry.isAuthorisedWrite(value))) {
						throw new BadRequestException("Received an entry with invalid signature", {
							cause: value,
						});
					}
					entries.push(value);
				},
				onError: (e) => {
					throw new BadRequestException("Drop decoding failed.", { cause: e });
				},
			}),
			new Promise<void>((resolve, reject) => {
				onRequestEnd = () => {
					onRequestEnd = undefined;
					clearInterval(stalledRequestCheckInterval);
					resolve();
				};

				stalledRequestCheckInterval = setInterval(() => {
					if (bytesReceived === 0) {
						clearInterval(stalledRequestCheckInterval);
						reject(new BadRequestException("No bytes received in the last 5 seconds"));
					} else {
						bytesReceived = 0;
					}
				}, 5000);
			}),
		]);

		if (onRequestEnd) {
			onRequestEnd();
		}

		if (entries.length === 0) {
			throw new BadRequestException("At least one entry must be present in the drop");
		}

		await this.syncService.ingestEntries(entries);

		res.send({});

		return next.handle();
	}
}
