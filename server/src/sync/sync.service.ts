import { type GetObjectCommandOutput, S3ServiceException } from "@aws-sdk/client-s3";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from "@nestjs/common";
import { DrizzleQueryError, SQL, and, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import {
	ByteString,
	Entry,
	EntryWithPayload,
	MAX_IN_DB_PAYLOAD_LENGTH,
	MemoryStore,
	OPENSELVES_NAMESPACE_ID,
	Path,
	PayloadDigest,
	SubspaceId,
	Timestamp,
	UInt64,
} from "openselves-common/willow";

import { DB, excludedColumn } from "../db/drizzle.js";
import { type EntryCreate, type User, entries, pathToPostgresByteaLiteral } from "../db/index.js";
import type { Transaction } from "../db/type-utils.js";
import { S3Service } from "./s3.service.js";

@Injectable()
export class SyncService {
	constructor(
		private readonly db: DB,
		private readonly s3Service: S3Service,
	) {}

	private async verifyEntries(userId: string, entries: EntryWithPayload[]) {
		for (const entry of entries) {
			// !!DON'T MERGE WITHOUT THIS!! TODO: verify user has write access (meadowcap)
			// if (!SubspaceId.equals(dto.subspaceId, userId)) {
			// 	throw new ForbiddenException("Invalid subspaceId", {
			// 		cause: dto,
			// 	});
			// }
			if (entry.payload) {
				if (entry.timestamp === UInt64.MAX_VALUE && entry.payloadLength.valueOf() > 0) {
					throw new BadRequestException(
						"Can't accept non-empty payload with maximum possible timestamp",
					);
				}

				if (
					entry.timestamp !== UInt64.MAX_VALUE &&
					entry.timestamp.valueOf() > Timestamp.now().valueOf() + 10n * 60n * 1000_000n
				) {
					throw new BadRequestException("Can't accept timestamp too far in the future");
				}

				if (BigInt(entry.payload.length) !== entry.payloadLength) {
					throw new BadRequestException("Invalid payloadLength", {
						cause: entry,
					});
				}

				if (!(await PayloadDigest.verify(entry.payloadDigest, entry.payload))) {
					throw new BadRequestException("Invalid payloadDigest", {
						cause: entry,
					});
				}
			}
		}
	}

	private toEntryCreate(entries: EntryWithPayload[]): EntryCreate[] {
		return entries.map((entry) => ({
			subspaceId: entry.subspaceId,
			path: entry.path,
			timestamp: UInt64.toInt64(entry.timestamp),
			payloadLength: UInt64.toInt64(entry.payloadLength),
			payloadDigest: entry.payloadDigest,
			payload: entry.payload,
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
							eq(
								entries.path,
								pathToPostgresByteaLiteral(entry.path).append(
									sql`[:(array_length(${entries.path}, 1))]`,
								),
							),
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
				!overridingEntries.some(
					(overridingEntry) =>
						SubspaceId.equals(overridingEntry.subspaceId, entry.subspaceId) &&
						Path.extends(entry.path, overridingEntry.path) &&
						Entry.isNewer(
							{ namespaceId: OPENSELVES_NAMESPACE_ID, ...overridingEntry },
							{ namespaceId: OPENSELVES_NAMESPACE_ID, ...entry },
						),
				),
		);
	}

	private prepareS3Uploads(entries: EntryCreate[]) {
		const s3PreparedEntries: EntryCreate[] = [...entries];
		const s3Uploads: {
			digest: ByteString;
			content: ByteString;
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
			s3PreparedEntries,
			s3Uploads,
		};
	}

	public async ingestEntries(userId: string, entriesToIngest: EntryWithPayload[]): Promise<void> {
		await this.verifyEntries(userId, entriesToIngest);

		try {
			await this.db.transaction(async (tx) => {
				const store = new MemoryStore<EntryWithPayload>(OPENSELVES_NAMESPACE_ID);
				await store.ingest(entriesToIngest);
				entriesToIngest = store.getEntries();

				const entryCreates = this.toEntryCreate(entriesToIngest);

				const survivingEntryCreates = await this.prefixPruneFromExistingEntriesInDb(
					tx,
					entryCreates,
				);
				if (survivingEntryCreates.length === 0) {
					return;
				}

				const { s3PreparedEntries, s3Uploads } =
					this.prepareS3Uploads(survivingEntryCreates);

				const pathPreparedEntries = s3PreparedEntries.map((entry) => ({
					...entry,
					path: pathToPostgresByteaLiteral(entry.path),
				}));

				const oldUpdatedRows = await tx
					.select()
					.from(entries)
					.where(
						or(
							...pathPreparedEntries.map((entry) =>
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
					.values(pathPreparedEntries)
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
									eq(
										pathToPostgresByteaLiteral(entry.path),
										sql`(${entries.path})[:(${entry.path.length})]`,
									),
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

				let digestsToDelete: ByteString[] = [];
				if (deletedDigests.length > 0) {
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
					digestsToDelete = deletedDigests.filter(
						(digest) => !stillReferencedDigests.includes(digest),
					);
				}

				if (s3Uploads.length > 0 || digestsToDelete.length > 0) {
					await this.s3Service.transaction((tx) => {
						for (const { digest, content } of s3Uploads) {
							tx.queuePut(digest.toBase64(), content, true);
						}

						for (const digest of digestsToDelete) {
							tx.queueDelete(digest.toBase64());
						}
					});
				}
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
		subspaceId: SubspaceId,
		timestamp: string,
	): Promise<{
		timestamp: string;
		entries: EntryWithPayload[];
	}> {
		const entries = await this.db.query.entries.findMany({
			where: {
				// !!DON'T MERGE WITHOUT THIS!! TODO: verify user has write access (meadowcap)
				subspaceId: {
					eq: subspaceId,
				},
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
					commandOutput = await this.s3Service.getObject(entry.payloadDigest.toBase64());
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
			entries: entries.map((entry) => {
				const { queryTime, timestamp, payloadLength, ...rest } = entry;
				const decodedEntry = {
					namespaceId: OPENSELVES_NAMESPACE_ID,
					...rest,
					timestamp: UInt64.fromInt64(timestamp),
					payloadLength: UInt64.fromInt64(payloadLength),
				};
				if (!EntryWithPayload.is(decodedEntry)) {
					throw new Error("Got entry without payload", {
						cause: decodedEntry,
					});
				}
				return decodedEntry;
			}),
		};
	}
}
