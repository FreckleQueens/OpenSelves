import { type SQL, sql } from "drizzle-orm";
import type { ByteString } from "openselves-common/willow";

export * from "./schema/index.js";
export * from "./relations.js";

export function byteStringArrayToPostgresByteaArrayLiteral(val: ByteString[]): SQL {
	return sql.raw(`(array[${val.map((el) => `'\\x${el.toHex()}'::bytea`).join(",")}]::bytea[])`);
}
