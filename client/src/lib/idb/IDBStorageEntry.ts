import { type DBColumn, IDBModel } from "$lib/idb/IDBModel";
import { IDB, type ModelBase } from "$lib/idb/idb";

type StorageEntry = ModelBase & {
	key: string;
	value: string;
};

export class IDBStorageEntry extends IDBModel<StorageEntry, "key"> {
	public constructor(idb: IDB) {
		super(idb, "storageEntries", "key");
	}

	protected generateUniquePrimaryKey(): string {
		throw new Error("ids must not be automatically generated on model " + this.storeName);
	}

	protected getDrizzleModel(): Record<keyof StorageEntry, DBColumn> {
		return {
			key: {
				dataType: "string",
				notNull: true,
				enumValues: undefined,
			},
			value: {
				dataType: "string",
				notNull: false,
				enumValues: undefined,
			},
		};
	}
}
