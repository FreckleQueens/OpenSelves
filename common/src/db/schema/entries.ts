import { sql } from "drizzle-orm";
import {
	bigint,
	bytea,
	camelCase,
	index,
	pgEnum,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

const payloadStorageEnum = pgEnum("entryPayloadStorage", ["s3"]);
export const entries = camelCase.table(
	"entries",
	{
		subspaceId: text()
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
			}),
		path: text().notNull(),
		timestamp: bigint({
			mode: "bigint",
		}).notNull(),
		payloadLength: bigint({
			mode: "bigint",
		}).notNull(),
		payloadDigest: text().notNull(),

		payload: bytea(),
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
