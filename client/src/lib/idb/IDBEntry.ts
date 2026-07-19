import { PAYLOAD_STORE_NAME, type PayloadStore } from "$lib/idb/IDBPayload";
import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";
import {
	Entry,
	EntryWithPayload,
	type NamespaceId,
	Path,
	type PayloadDigest,
	SubspaceId,
	Timestamp,
} from "openselves-common/willow";

export type EntryStore = "entries";
export const ENTRY_STORE_NAME: EntryStore = "entries";

type IDBFriendlyEntry = Omit<Entry, "timestamp" | "payloadLength"> & {
	timestamp: string;
	payloadLength: string;
};

export class IDBEntry {
	public static toIDBFriendlyEntry(entry: Entry): IDBFriendlyEntry {
		return {
			...entry,
			timestamp: Timestamp.padForLexicographicalOrder(entry.timestamp),
			payloadLength: Timestamp.padForLexicographicalOrder(entry.payloadLength),
		};
	}

	public static fromIDBFriendlyEntry(data: IDBFriendlyEntry): Entry {
		return {
			...data,
			timestamp: BigInt(data.timestamp),
			payloadLength: BigInt(data.payloadLength),
		};
	}

	public static isIDBFriendlyEntry(data: unknown): data is IDBFriendlyEntry {
		return !!(
			data &&
			typeof data === "object" &&
			Entry.is({
				...data,
				timestamp: 0n,
				payloadLength: 0n,
			}) &&
			typeof data["timestamp"] === "string" &&
			typeof data["payloadLength"] === "string"
		);
	}

	public constructor(protected readonly idb: IDB) {}

	public async getByNamespaceId(
		namespaceId: NamespaceId,
		tx?: IDBTransactionWrapper<EntryStore>,
	): Promise<EntryWithPayload[]> {
		return await this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME],
			async (tx) => {
				const records = await this.idb.getByIndex(
					ENTRY_STORE_NAME,
					"namespaceId",
					namespaceId,
					undefined,
					tx,
				);
				return this.onlyValidEntriesWithLoadedPayloads(records, tx);
			},
			tx,
		);
	}

	public async getByNamespaceIdSubspaceId(
		namespaceId: NamespaceId,
		subspaceId: SubspaceId,
		tx?: IDBTransactionWrapper<EntryStore>,
	): Promise<EntryWithPayload[]> {
		return await this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME],
			async (tx) => {
				const records = await this.idb.getByIndex(
					ENTRY_STORE_NAME,
					"namespaceIdSubspaceId",
					[namespaceId, subspaceId],
					undefined,
					tx,
				);
				return this.onlyValidEntriesWithLoadedPayloads(records, tx);
			},
			tx,
		);
	}

	public async getByPathPrefix(
		namespaceId: NamespaceId,
		subspaceId: SubspaceId,
		pathPrefix: Path,
		tx?: IDBTransactionWrapper<EntryStore>,
	): Promise<EntryWithPayload[]> {
		if (pathPrefix.length === 0) {
			throw new Error("Cannot get by empty path prefix");
		}
		return this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME],
			async (tx) => {
				const nextPrefix = Path.getNextPrefix(pathPrefix);
				const records = await this.idb.getByIndex(
					ENTRY_STORE_NAME,
					"primaryKey",
					nextPrefix
						? IDBKeyRange.bound(
								[namespaceId, subspaceId, pathPrefix],
								[namespaceId, subspaceId, nextPrefix],
								false,
								true,
							)
						: IDBKeyRange.lowerBound([namespaceId, subspaceId, pathPrefix]),
					undefined,
					tx,
				);
				return this.onlyValidEntriesWithLoadedPayloads(records, tx);
			},
			tx,
		);
	}

	public async getByPayloadDigest(
		payloadDigest: PayloadDigest,
		tx?: IDBTransactionWrapper<EntryStore>,
	): Promise<Entry[]> {
		const records = await this.idb.getByIndex(
			ENTRY_STORE_NAME,
			"payloadDigest",
			payloadDigest,
			undefined,
			tx,
		);
		return this.onlyValidRecords(records);
	}

	public async getAfterSavedAt(
		namespaceId: NamespaceId,
		subspaceId: SubspaceId,
		savedAtTimestamp: bigint,
		tx?: IDBTransactionWrapper<EntryStore>,
	): Promise<EntryWithPayload[]> {
		return this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME],
			async (tx) => {
				const records = await this.idb.getByIndex(
					ENTRY_STORE_NAME,
					"namespaceIdSubspaceIdSavedAt",
					IDBKeyRange.lowerBound([
						namespaceId,
						subspaceId,
						Timestamp.padForLexicographicalOrder(savedAtTimestamp),
					]),
					undefined,
					tx,
				);
				return this.onlyValidEntriesWithLoadedPayloads(records, tx);
			},
			tx,
		);
	}

	public async putAndDelete(
		entryToPut: Entry | EntryWithPayload,
		markForSync: boolean,
		entriesToDelete: Entry[],
		tx?: IDBTransactionWrapper<EntryStore | PayloadStore>,
	) {
		await this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME],
			async (tx) => {
				let entryToPutWithoutPayload = entryToPut;
				if (EntryWithPayload.is(entryToPutWithoutPayload)) {
					const { payload, ...rest } = entryToPutWithoutPayload;
					await this.idb.payloads.put(entryToPut.payloadDigest, payload, tx);
					entryToPutWithoutPayload = rest;
				}
				for (const entry of entriesToDelete) {
					await tx.delete(ENTRY_STORE_NAME, [
						entry.namespaceId,
						entry.subspaceId,
						entry.path,
					]);
				}
				const dataToPut: Record<string, unknown> = {
					...IDBEntry.toIDBFriendlyEntry(entryToPutWithoutPayload),
				};
				if (markForSync) {
					dataToPut.savedAt = Timestamp.padForLexicographicalOrder(Timestamp.now());
				}
				await tx.put(ENTRY_STORE_NAME, dataToPut);

				await Promise.all(
					entriesToDelete.map(async (entry) => {
						if ((await this.getByPayloadDigest(entry.payloadDigest, tx)).length === 0) {
							await this.idb.payloads.delete(entry.payloadDigest, tx);
						}
					}),
				);
			},
			tx,
		);
	}

	private async loadPayload(
		entry: Entry,
		tx: IDBTransactionWrapper<EntryStore | PayloadStore>,
	): Promise<Entry | EntryWithPayload> {
		const payload = await this.idb.payloads.getByDigest(entry.payloadDigest, tx);
		return payload !== undefined
			? {
					...entry,
					payload: payload,
				}
			: entry;
	}

	private async loadPayloads(
		entries: Entry[],
		tx: IDBTransactionWrapper<EntryStore | PayloadStore>,
	): Promise<(Entry | EntryWithPayload)[]> {
		return Promise.all(entries.map((entry) => this.loadPayload(entry, tx)));
	}

	private onlyValidRecords(records: object[]): Entry[] {
		return records
			.filter((record) => IDBEntry.isIDBFriendlyEntry(record))
			.map((record) => IDBEntry.fromIDBFriendlyEntry(record));
	}

	private async onlyValidEntriesWithLoadedPayloads(
		records: object[],
		tx: IDBTransactionWrapper<EntryStore | PayloadStore>,
	): Promise<EntryWithPayload[]> {
		return (await this.loadPayloads(this.onlyValidRecords(records), tx)).filter(
			EntryWithPayload.is,
		);
	}
}
