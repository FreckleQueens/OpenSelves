import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";
import { Profile, type ProfileData } from "$lib/idb/profiles/Profile";
import { isValidSchemaStatic, validateSchemaStatic } from "openselves-common/schema";

export type ProfileStore = "profiles";
export const PROFILE_STORE_NAME: ProfileStore = "profiles";

export class IDBProfile {
	public constructor(private readonly idb: IDB) {}

	public async get(
		id: string,
		tx?: IDBTransactionWrapper<ProfileStore>,
	): Promise<ProfileData | undefined> {
		const record = await this.idb.get(PROFILE_STORE_NAME, id, tx);

		if (record === undefined) {
			return undefined;
		}

		if (!isValidSchemaStatic(Profile.DATA_SCHEMA, record)) {
			throw new Error("Got invalid user profile data", {
				cause: {
					profileId: id,
					validation: validateSchemaStatic(Profile.DATA_SCHEMA, record),
					data: record,
				},
			});
		}

		return record;
	}

	public async put(value: ProfileData, tx?: IDBTransactionWrapper<ProfileStore>) {
		return this.idb.put(PROFILE_STORE_NAME, value, tx);
	}

	public async delete(id: string, tx?: IDBTransactionWrapper<ProfileStore>) {
		return this.idb.delete(PROFILE_STORE_NAME, id, tx);
	}

	public async getAll(tx?: IDBTransactionWrapper<ProfileStore>): Promise<ProfileData[]> {
		const records = await this.idb.getAll(PROFILE_STORE_NAME, tx);
		return records.map((record) => {
			if (!isValidSchemaStatic(Profile.DATA_SCHEMA, record)) {
				throw new Error("Got invalid user profile data", {
					cause: {
						validation: validateSchemaStatic(Profile.DATA_SCHEMA, record),
						data: record,
					},
				});
			}

			return record;
		});
	}
}
