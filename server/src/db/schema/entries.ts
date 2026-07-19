import { type SQL, sql } from "drizzle-orm";
import {
	bigint,
	bytea,
	camelCase,
	index,
	pgEnum,
	primaryKey,
	timestamp,
} from "drizzle-orm/pg-core";
import type { ByteString, Path } from "openselves-common/willow";

const payloadStorageEnum = pgEnum("entryPayloadStorage", ["s3"]);
export const entries = camelCase.table(
	"entries",
	{
		subspaceId: bytea().notNull().$type<ByteString>(),
		path: bytea().array().notNull().$type<ByteString>(),
		timestamp: bigint({
			mode: "bigint",
		}).notNull(),
		payloadLength: bigint({
			mode: "bigint",
		}).notNull(),
		payloadDigest: bytea().notNull().$type<ByteString>(),

		payload: bytea().$type<ByteString>(),
		payloadStorage: payloadStorageEnum(),

		updatedAt: timestamp({
			mode: "string",
		})
			.notNull()
			.default(sql`current_timestamp`)
			.$onUpdate(() => sql`current_timestamp`),
	},
	(table) => [
		primaryKey({
			columns: [table.subspaceId, table.path],
		}),
		index("subspaceId_idx").on(table.subspaceId.asc()),
	],
);
export type Entry = typeof entries.$inferSelect;
export type EntryCreate = typeof entries.$inferInsert;
export type EntryUpdate = Partial<EntryCreate>;

export function pathToPostgresByteaLiteral(path: Path): SQL {
	return sql.raw(
		`(array[${path.map((comp) => `'\\x${comp.toHex()}'::bytea`).join(",")}]::bytea[])`,
	);
}
