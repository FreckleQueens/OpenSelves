import { index, json, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id } from "./utils.js";
import { members } from "./members.js";
import { inArray } from "drizzle-orm";

export const logOperationType = pgEnum("logOperationType", ["create", "update", "delete"]);
export const logs = pgTable(
	"logs",
	{
		...id,
		memberId: text()
			.notNull()
			.references(() => members.id, {
				onDelete: "cascade",
			}),
		operationType: logOperationType().notNull(),
		data: json(),
		executedAt: timestamp({ precision: 3 }).notNull(),
		pushedAt: timestamp({ precision: 3 }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("unique_create_delete")
			.on(table.memberId, table.operationType)
			.where(inArray(table.operationType, ["create", "delete"])),
		index("memberId_index").on(table.memberId),
	],
);
export type Log = typeof logs.$inferSelect;
export type LogCreate = typeof logs.$inferInsert;
