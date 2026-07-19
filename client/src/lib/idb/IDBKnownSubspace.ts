import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";
import { Ed25519Sk, SubspaceId } from "openselves-common/willow";

export type KnownSubspaceStore = "knownSubspaces";
export const KNOWN_SUBSPACE_STORE_NAME: KnownSubspaceStore = "knownSubspaces";
export type KnownSubspace = { userId: string; subspaceId: SubspaceId; secretKey?: Ed25519Sk };

export class IDBKnownSubspace {
	public constructor(private readonly idb: IDB) {}

	public async get(
		userId: string,
		tx?: IDBTransactionWrapper<KnownSubspaceStore>,
	): Promise<KnownSubspace[]> {
		const records = await this.idb.getByIndex(
			KNOWN_SUBSPACE_STORE_NAME,
			"userId",
			userId,
			undefined,
			tx,
		);

		if (!records.every((record) => this.isValidKnownSubspace(record))) {
			throw new Error("A known subspace of userId " + userId + " is invalid", {
				cause: records,
			});
		}

		return records;
	}

	public async put(knownSubspace: KnownSubspace, tx?: IDBTransactionWrapper<KnownSubspaceStore>) {
		return this.idb.put(KNOWN_SUBSPACE_STORE_NAME, knownSubspace, tx);
	}

	public async delete(
		userId: string,
		subspaceId: SubspaceId,
		tx?: IDBTransactionWrapper<KnownSubspaceStore>,
	) {
		return this.idb.delete(KNOWN_SUBSPACE_STORE_NAME, [userId, subspaceId], tx);
	}

	public async getAll(tx?: IDBTransactionWrapper<KnownSubspaceStore>): Promise<KnownSubspace[]> {
		const records = await this.idb.getAll(KNOWN_SUBSPACE_STORE_NAME, tx);
		return records.map((record) => {
			if (!this.isValidKnownSubspace(record)) {
				throw new Error("A known subspace is invalid", {
					cause: record,
				});
			}
			return record;
		});
	}

	private isValidKnownSubspace(value: unknown): value is KnownSubspace {
		return !!(
			value &&
			typeof value === "object" &&
			typeof value["userId"] === "string" &&
			SubspaceId.is(value["subspaceId"]) &&
			(value["secretKey"] === undefined || Ed25519Sk.is(value["secretKey"]))
		);
	}
}
