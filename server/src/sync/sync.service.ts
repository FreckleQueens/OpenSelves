import { type GetObjectCommandOutput, S3ServiceException } from "@aws-sdk/client-s3";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from "@nestjs/common";
import { DrizzleQueryError, SQL, and, eq, gt, inArray, like, lt, or, sql } from "drizzle-orm";
import {
	type Entry,
	type EntryCreate,
	type Transaction,
	type User,
	entries,
} from "openselves-common/db";
import {
	MAX_IN_DB_PAYLOAD_LENGTH,
	MemoryStore,
	OPENSELVES_NAMESPACE_ID,
	hashPayload,
	int64toUint64,
	isEntryNewerThan,
	uint64ToInt64,
} from "openselves-common/willow";

import { DB, excludedColumn } from "../db/drizzle.js";
import { PushEntryDto } from "./data/push.dto.js";
import { S3Service } from "./s3.service.js";

@Injectable()
export class SyncService {
	constructor(
		private readonly db: DB,
		private readonly s3Service: S3Service,
	) {}

	private async verifyEntries(userId: string, entryDtos: PushEntryDto[]) {
		for (const dto of entryDtos) {
			if (dto.subspaceId !== userId) {
				throw new ForbiddenException("Invalid subspaceId", {
					cause: dto,
				});
			}
			if (dto.payload) {
				if (BigInt(dto.payload.length) !== dto.payloadLength) {
					throw new BadRequestException("Invalid payloadLength", {
						cause: dto,
					});
				}

				if ((await hashPayload(dto.payload)) !== dto.payloadDigest) {
					throw new BadRequestException("Invalid payloadDigest", {
						cause: dto,
					});
				}
			}
		}
	}

	private toEntryCreate(entryDtos: PushEntryDto[]) {
		return entryDtos.map((dto) => ({
			subspaceId: dto.subspaceId,
			path: dto.path,
			timestamp: uint64ToInt64(dto.timestamp),
			payloadLength: uint64ToInt64(dto.payloadLength),
			payloadDigest: dto.payloadDigest,
			payload: Buffer.from(dto.payload),
			payloadStorage: null,
		}));
	}

	private async prefixPruneFromExistingEntriesInDb(tx: Transaction, entryCreates: EntryCreate[]) {
		const overridingEntries = await tx
			.select()
			.from(entries)
			.where(
				or(
					...entryCreates.map((entry) =>
						and(
							eq(entries.subspaceId, entry.subspaceId),
							like(sql`${entry.path}`, sql`concat(${entries.path}, '/%')`),
							or(
								gt(entries.timestamp, entry.timestamp),
								and(
									eq(entries.timestamp, entry.timestamp),
									gt(entries.payloadDigest, entry.payloadDigest),
								),
								and(
									eq(entries.timestamp, entry.timestamp),
									eq(entries.payloadDigest, entry.payloadDigest),
									gt(entries.payloadLength, entry.payloadLength),
								),
							),
						),
					),
				),
			);

		return entryCreates.filter(
			(entry) =>
				!overridingEntries.some((overridingEntry) =>
					isEntryNewerThan(
						{ namespaceId: OPENSELVES_NAMESPACE_ID, ...overridingEntry },
						{ namespaceId: OPENSELVES_NAMESPACE_ID, ...entry },
					),
				),
		);
	}

	private prepareS3Uploads(entries: EntryCreate[]) {
		const preparedEntries: EntryCreate[] = [...entries];
		const s3Uploads: {
			digest: string;
			content: Buffer<ArrayBufferLike>;
		}[] = [];

		for (const entry of entries) {
			if (entry.payload && entry.payload.length > MAX_IN_DB_PAYLOAD_LENGTH) {
				s3Uploads.push({
					digest: entry.payloadDigest,
					content: entry.payload,
				});
				entry.payload = null;
				entry.payloadStorage = "s3";
			}
		}

		return {
			preparedEntries,
			s3Uploads,
		};
	}

	public async ingestEntries(userId: string, entryDtos: PushEntryDto[]): Promise<void> {
		await this.verifyEntries(userId, entryDtos);

		try {
			await this.db.transaction(async (tx) => {
				const store = new MemoryStore<PushEntryDto>(OPENSELVES_NAMESPACE_ID);
				await store.ingest(entryDtos);
				entryDtos = store.getEntries();

				const entryCreates = this.toEntryCreate(entryDtos);

				const survivingEntryCreates = await this.prefixPruneFromExistingEntriesInDb(
					tx,
					entryCreates,
				);
				if (survivingEntryCreates.length === 0) {
					return;
				}

				const { preparedEntries, s3Uploads } = this.prepareS3Uploads(survivingEntryCreates);

				const oldUpdatedRows = await tx
					.select()
					.from(entries)
					.where(
						or(
							...preparedEntries.map((entry) =>
								and(
									eq(entries.subspaceId, entry.subspaceId),
									eq(entries.path, entry.path),
									or(
										lt(entries.timestamp, entry.timestamp),
										and(
											eq(entries.timestamp, entry.timestamp),
											lt(entries.payloadDigest, entry.payloadDigest),
										),
										and(
											eq(entries.timestamp, entry.timestamp),
											eq(entries.payloadDigest, entry.payloadDigest),
											lt(entries.payloadLength, entry.payloadLength),
										),
									),
								),
							),
						),
					);

				const upsertedEntries = await tx
					.insert(entries)
					.values(preparedEntries)
					.onConflictDoUpdate({
						target: [entries.subspaceId, entries.path],
						setWhere: or(
							lt(entries.timestamp, excludedColumn(entries.timestamp)),
							and(
								eq(entries.timestamp, excludedColumn(entries.timestamp)),
								lt(entries.payloadDigest, excludedColumn(entries.payloadDigest)),
							),
							and(
								eq(entries.timestamp, excludedColumn(entries.timestamp)),
								eq(entries.payloadDigest, excludedColumn(entries.payloadDigest)),
								lt(entries.payloadLength, excludedColumn(entries.payloadLength)),
							),
						) as SQL,
						set: {
							timestamp: excludedColumn(entries.timestamp),
							payloadLength: excludedColumn(entries.payloadLength),
							payloadDigest: excludedColumn(entries.payloadDigest),
							payload: excludedColumn(entries.payload),
							payloadStorage: excludedColumn(entries.payloadStorage),
						},
					})
					.returning();

				if (upsertedEntries.length === 0) {
					return;
				}

				const prunedEntries = await tx
					.delete(entries)
					.where(
						or(
							...upsertedEntries.map((entry) =>
								and(
									eq(entries.subspaceId, entry.subspaceId),
									like(entries.path, `${entry.path}/%`),
									or(
										lt(entries.timestamp, entry.timestamp),
										and(
											eq(entries.timestamp, entry.timestamp),
											lt(entries.payloadDigest, entry.payloadDigest),
										),
										and(
											eq(entries.timestamp, entry.timestamp),
											eq(entries.payloadDigest, entry.payloadDigest),
											lt(entries.payloadLength, entry.payloadLength),
										),
									),
								),
							),
						),
					)
					.returning();

				const deletedDigests = [
					...new Set(
						[...oldUpdatedRows, ...prunedEntries]
							.filter((row) => row.payloadStorage === "s3")
							.map((row) => row.payloadDigest),
					),
				];
				const stillReferencedDigests = [
					...new Set(
						(
							await tx
								.select({
									payloadDigest: entries.payloadDigest,
								})
								.from(entries)
								.where(inArray(entries.payloadDigest, deletedDigests))
						).map((row) => row.payloadDigest),
					),
				];
				const digestsToDelete = deletedDigests.filter(
					(digest) => !stillReferencedDigests.includes(digest),
				);

				await this.s3Service.transaction((tx) => {
					for (const { digest, content } of s3Uploads) {
						tx.queuePut(digest, content, true);
					}

					for (const digest of digestsToDelete) {
						tx.queueDelete(digest);
					}
				});
			});
		} catch (error) {
			if (error instanceof DrizzleQueryError && error.cause?.["code"] === "23505") {
				throw new ConflictException(
					{
						message:
							"Some logs could not be committed to history due to already existing models",
					},
					{ cause: error },
				);
			}
			throw error;
		}
	}

	public async getEntriesFrom(
		userId: User["id"],
		timestamp: string,
	): Promise<{
		timestamp: string;
		entries: Entry[];
	}> {
		const entries = await this.db.query.entries.findMany({
			where: {
				subspaceId: userId,
				updatedAt: {
					gte: timestamp === "" ? "-infinity" : timestamp,
				},
			},
			orderBy: {
				updatedAt: "asc",
			},
			extras: {
				queryTime: sql`current_timestamp`,
			},
		});

		let returnedTimestamp = timestamp;
		if (entries.length > 0) {
			const queryTime = entries[entries.length - 1].queryTime;
			if (typeof queryTime !== "string") {
				throw new InternalServerErrorException(
					"DB responded with invalid or missing queryTime",
				);
			}
			returnedTimestamp = queryTime;
		}

		for (const entry of entries) {
			if (!entry.payload && entry.payloadStorage === "s3") {
				let commandOutput: GetObjectCommandOutput;
				try {
					commandOutput = await this.s3Service.getObject(entry.payloadDigest);
				} catch (error) {
					if (error instanceof S3ServiceException) {
						switch (error.$metadata.httpStatusCode) {
							case 404:
								continue;
						}
					}
					throw error;
				}
				if (!commandOutput.Body) {
					throw new NotFoundException();
				}
				entry.payload = Buffer.from(await commandOutput.Body.transformToByteArray());
			}
		}

		return {
			timestamp: returnedTimestamp,
			entries: entries.map((entries) => {
				const { queryTime, timestamp, payloadLength, ...rest } = entries;
				return {
					...rest,
					timestamp: int64toUint64(timestamp),
					payloadLength: int64toUint64(payloadLength),
				};
			}),
		};
	}
}
