import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";
import { Capability, Ed25519Sk, SubspaceId } from "openselves-common/willow";

export type KnownSubspaceStore = "knownSubspaces";
export const KNOWN_SUBSPACE_STORE_NAME: KnownSubspaceStore = "knownSubspaces";
export class KnownSubspace {
	public static is(value: unknown): value is KnownSubspace {
		return !!(
			value &&
			typeof value === "object" &&
			typeof value["profileId"] === "string" &&
			SubspaceId.is(value["subspaceId"]) &&
			(value["secretKey"] === undefined || Ed25519Sk.is(value["secretKey"])) &&
			(value["capabilities"] === undefined ||
				(Array.isArray(value["capabilities"]) &&
					value["capabilities"].every((val) => Capability.is(val))))
		);
	}
	public constructor(
		public profileId: string,
		public subspaceId: SubspaceId,
		public secretKey?: Ed25519Sk,
		public capabilities?: Capability[],
	) {}
}

export class IDBKnownSubspace {
	public constructor(private readonly idb: IDB) {}

	public async getByProfileId(
		profileId: string,
		tx?: IDBTransactionWrapper<KnownSubspaceStore>,
	): Promise<KnownSubspace[]> {
		const records = await this.idb.getByIndex(
			KNOWN_SUBSPACE_STORE_NAME,
			"profileId",
			profileId,
			undefined,
			tx,
		);

		if (!records.every((record) => this.isValidKnownSubspace(record))) {
			throw new Error("A known subspace of profileId " + profileId + " is invalid", {
				cause: records,
			});
		}

		return records;
	}

	public async put(knownSubspace: KnownSubspace, tx?: IDBTransactionWrapper<KnownSubspaceStore>) {
		return this.idb.put(KNOWN_SUBSPACE_STORE_NAME, knownSubspace, tx);
	}

	public async delete(
		profileId: string,
		subspaceId: SubspaceId,
		tx?: IDBTransactionWrapper<KnownSubspaceStore>,
	) {
		return this.idb.delete(KNOWN_SUBSPACE_STORE_NAME, [profileId, subspaceId], tx);
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
			typeof value["profileId"] === "string" &&
			SubspaceId.is(value["subspaceId"]) &&
			(value["secretKey"] === undefined || Ed25519Sk.is(value["secretKey"]))
		);
	}
}
