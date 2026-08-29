import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";
import { ByteString, PayloadDigest } from "openselves-common/willow";

export type PayloadStore = "payloads";
export const PAYLOAD_STORE_NAME: PayloadStore = "payloads";

export class IDBPayload {
	public constructor(protected readonly idb: IDB) {}

	public async getByDigest(
		digest: PayloadDigest,
		tx?: IDBTransactionWrapper<PayloadStore>,
	): Promise<ByteString | undefined> {
		const record = await this.idb.get(PAYLOAD_STORE_NAME, digest, tx);
		return record && typeof record === "object" && ByteString.is(record["contents"])
			? record["contents"]
			: undefined;
	}

	public async put(
		digest: PayloadDigest,
		contents: ByteString,
		tx?: IDBTransactionWrapper<PayloadStore>,
	) {
		return await this.idb.put(PAYLOAD_STORE_NAME, { digest, contents }, tx);
	}

	public async delete(
		digest: PayloadDigest,
		tx?: IDBTransactionWrapper<PayloadStore>,
	): Promise<void> {
		return this.idb.delete(PAYLOAD_STORE_NAME, digest, tx);
	}
}
