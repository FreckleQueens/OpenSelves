import {
	check,
	foreignKey,
	json,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { id } from "./utils.js";
import { members } from "./members.js";
import { and, eq, inArray, isNotNull, isNull, not, or, SQL } from "drizzle-orm";
import { users } from "./users.js";

export const logOperationType = pgEnum("logOperationType", ["create", "update", "delete"]);
export const logs = pgTable(
	"logs",
	{
		userId: text()
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
			}),
		...id,
		memberId: text(),
		operationType: logOperationType().notNull(),
		data: json(),
		deletedId: text(),
		executedAt: timestamp({ precision: 3 }).notNull(),
		pushedAt: timestamp({ precision: 3 }).notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.id],
		}),
		foreignKey({
			columns: [table.userId, table.memberId],
			foreignColumns: [members.userId, members.id],
		}).onDelete("cascade"),
		uniqueIndex("unique_create_delete")
			.on(table.userId, table.memberId, table.operationType)
			.where(inArray(table.operationType, ["create", "delete"])),
		check(
			"delete_or_has_ref_id_check",
			or(eq(table.operationType, "delete"), isNotNull(table.memberId)) as SQL,
		),
		check(
			"deletedId_check",
			or(
				and(eq(table.operationType, "delete"), isNotNull(table.deletedId)),
				and(not(eq(table.operationType, "delete")), isNull(table.deletedId)),
			) as SQL,
		),
	],
);
export type Log = typeof logs.$inferSelect;
export type LogCreate = typeof logs.$inferInsert;
