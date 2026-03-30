import {
	check,
	index,
	json,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { id } from "./utils.js";
import { members } from "./members.js";
import { eq, inArray, isNotNull, or, SQL } from "drizzle-orm";

export const logOperationType = pgEnum("logOperationType", ["create", "update", "delete"]);
export const logs = pgTable(
	"logs",
	{
		...id,
		memberId: text().references(() => members.id, {
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
		check(
			"delete_or_has_ref_id_check",
			or(eq(table.operationType, "delete"), isNotNull(table.memberId)) as SQL,
		),
	],
);
export type Log = typeof logs.$inferSelect;
export type LogCreate = typeof logs.$inferInsert;
