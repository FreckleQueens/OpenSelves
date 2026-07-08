import { PAYLOAD_STORE_NAME, type PayloadStore } from "$lib/idb/IDBPayload";
import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";
import {
	type Entry,
	type EntryWithPayload,
	fromJsonFriendly,
	isEntryWithPayload,
	isJsonFriendlyEntry,
	j2000Now,
	padUint64,
	toJsonFriendly,
} from "openselves-common/willow";

export type EntryStore = "entries";
export const ENTRY_STORE_NAME: EntryStore = "entries";

export class IDBEntry {
	public constructor(protected readonly idb: IDB) {}

	public async getByNamespaceId(
		namespaceId: string,
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
				return (
					await this.loadPayloads(
						records
							.filter((record) => isJsonFriendlyEntry(record))
							.map((entry) => fromJsonFriendly(entry)),
						tx,
					)
				).filter(isEntryWithPayload);
			},
			tx,
		);
	}

	public async getByNamespaceIdSubspaceId(
		namespaceId: string,
		subspaceId: string,
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
				return (
					await this.loadPayloads(
						records
							.filter((record) => isJsonFriendlyEntry(record))
							.map((entry) => fromJsonFriendly(entry)),
						tx,
					)
				).filter(isEntryWithPayload);
			},
			tx,
		);
	}

	public async getByPathPrefix(
		namespaceId: string,
		subspaceId: string,
		pathPrefix: string,
		tx?: IDBTransactionWrapper<EntryStore>,
	): Promise<EntryWithPayload[]> {
		if (pathPrefix.endsWith("/")) {
			throw new Error("pathPrefix must not end with /");
		}
		return this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME],
			async (tx) => {
				const records = await this.idb.getByIndex(
					ENTRY_STORE_NAME,
					"primaryKey",
					IDBKeyRange.bound(
						[namespaceId, subspaceId, pathPrefix],
						[namespaceId, subspaceId, pathPrefix + "_"],
					),
					undefined,
					tx,
				);
				return (
					await this.loadPayloads(
						records
							.filter((record) => isJsonFriendlyEntry(record))
							.map((entry) => fromJsonFriendly(entry)),
						tx,
					)
				).filter(isEntryWithPayload);
			},
			tx,
		);
	}

	public async getByPayloadDigest(
		payloadDigest: string,
		tx?: IDBTransactionWrapper<EntryStore>,
	): Promise<Entry[]> {
		const records = await this.idb.getByIndex(
			ENTRY_STORE_NAME,
			"payloadDigest",
			payloadDigest,
			undefined,
			tx,
		);
		return records
			.filter((record) => isJsonFriendlyEntry(record))
			.map((entry) => fromJsonFriendly(entry));
	}

	public async getAfterSavedAt(
		namespaceId: string,
		subspaceId: string,
		savedAtTimestamp: bigint,
		tx?: IDBTransactionWrapper<EntryStore>,
	): Promise<EntryWithPayload[]> {
		return this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME],
			async (tx) => {
				const records = await this.idb.getByIndex(
					ENTRY_STORE_NAME,
					"namespaceIdSubspaceIdSavedAt",
					IDBKeyRange.lowerBound([namespaceId, subspaceId, padUint64(savedAtTimestamp)]),
					undefined,
					tx,
				);
				return (
					await this.loadPayloads(
						records
							.filter((record) => isJsonFriendlyEntry(record))
							.map((entry) => fromJsonFriendly(entry)),
						tx,
					)
				).filter(isEntryWithPayload);
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
				if (isEntryWithPayload(entryToPutWithoutPayload)) {
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
					...toJsonFriendly(entryToPutWithoutPayload),
				};
				if (markForSync) {
					dataToPut.savedAt = padUint64(j2000Now());
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
		return typeof payload === "string"
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
}
