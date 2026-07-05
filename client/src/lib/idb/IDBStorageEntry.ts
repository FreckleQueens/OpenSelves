import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";

export type StorageEntryStore = "storageEntries";
export const STORAGE_ENTRY_STORE_NAME: StorageEntryStore = "storageEntries";

export type StorageEntry = { key: string; value: string };

export class IDBStorageEntry {
	public constructor(private readonly idb: IDB) {}

	public async get(
		key: string,
		tx?: IDBTransactionWrapper<StorageEntryStore>,
	): Promise<string | undefined> {
		const record = await this.idb.get(STORAGE_ENTRY_STORE_NAME, key, tx);

		if (record === undefined) {
			return undefined;
		}

		if (typeof record["value"] !== "string") {
			throw new Error("record with key " + key + " has a not-string value", {
				cause: record,
			});
		}

		return record["value"];
	}

	public async put(key: string, value: string, tx?: IDBTransactionWrapper<StorageEntryStore>) {
		return this.idb.put(STORAGE_ENTRY_STORE_NAME, { key, value }, tx);
	}

	public async delete(key: string, tx?: IDBTransactionWrapper<StorageEntryStore>) {
		return this.idb.delete(STORAGE_ENTRY_STORE_NAME, key, tx);
	}

	public async getAll(tx?: IDBTransactionWrapper<StorageEntryStore>): Promise<StorageEntry[]> {
		const records = await this.idb.getAll(STORAGE_ENTRY_STORE_NAME, tx);
		return records.map((record) => {
			if (typeof record["key"] !== "string" || typeof record["value"] !== "string") {
				throw new Error("Got invalid StorageEntry", { cause: record });
			}
			return {
				key: record["key"],
				value: record["value"],
			};
		});
	}
}
