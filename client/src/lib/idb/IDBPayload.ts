import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";

export type PayloadStore = "payloads";
export const PAYLOAD_STORE_NAME: PayloadStore = "payloads";

export class IDBPayload {
	public constructor(protected readonly idb: IDB) {}

	public async getByDigest(
		digest: string,
		tx?: IDBTransactionWrapper<PayloadStore>,
	): Promise<string | undefined> {
		const record = await this.idb.get(PAYLOAD_STORE_NAME, digest, tx);
		return record && typeof record === "object" && typeof record["contents"] === "string"
			? record["contents"]
			: undefined;
	}

	public async put(digest: string, contents: string, tx?: IDBTransactionWrapper<PayloadStore>) {
		return await this.idb.put(PAYLOAD_STORE_NAME, { digest, contents }, tx);
	}

	public async delete(digest: string, tx?: IDBTransactionWrapper<PayloadStore>): Promise<void> {
		return this.idb.delete(PAYLOAD_STORE_NAME, digest, tx);
	}
}
