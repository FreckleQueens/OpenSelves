import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";

export type SettingStore = "settings";
export const SETTING_STORE_NAME: SettingStore = "settings";

export type Setting = { key: string; value: string };

export class IDBSetting {
	public constructor(private readonly idb: IDB) {}

	public async get(
		key: string,
		tx?: IDBTransactionWrapper<SettingStore>,
	): Promise<string | undefined> {
		const record = await this.idb.get(SETTING_STORE_NAME, key, tx);

		if (record === undefined) {
			return undefined;
		}

		const value = record["value"];
		if (typeof value !== "string") {
			throw new Error("record with key " + key + " has a non-string value", {
				cause: record,
			});
		}

		return value;
	}

	public async put(
		key: string,
		value: string | object,
		tx?: IDBTransactionWrapper<SettingStore>,
	) {
		return this.idb.put(SETTING_STORE_NAME, { key, value }, tx);
	}

	public async delete(key: string, tx?: IDBTransactionWrapper<SettingStore>) {
		return this.idb.delete(SETTING_STORE_NAME, key, tx);
	}

	public async getAll(tx?: IDBTransactionWrapper<SettingStore>): Promise<Setting[]> {
		const records = await this.idb.getAll(SETTING_STORE_NAME, tx);
		return records.map((record) => {
			if (typeof record["key"] !== "string" || typeof record["value"] !== "string") {
				throw new Error("Got invalid Setting", { cause: record });
			}
			return {
				key: record["key"],
				value: record["value"],
			};
		});
	}
}
