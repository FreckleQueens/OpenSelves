import {
	check,
	foreignKey,
	json,
	pgEnum,
	primaryKey,
	camelCase,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { id } from "./utils.js";
import { members } from "./members.js";
import { and, eq, inArray, isNotNull, isNull, not, or, sql, SQL } from "drizzle-orm";
import { users } from "./users.js";
import { fronts } from "./fronts.js";

export const logOperationType = pgEnum("logOperationType", ["create", "update", "delete"]);
export const logs = camelCase.table(
	"logs",
	{
		userId: text()
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
			}),
		...id(),
		memberId: text(),
		frontId: text(),
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
		foreignKey({
			columns: [table.userId, table.frontId],
			foreignColumns: [fronts.userId, fronts.id],
		}).onDelete("cascade"),
		uniqueIndex("unique_create_delete")
			.on(table.userId, table.memberId, table.frontId, table.operationType)
			.where(inArray(table.operationType, ["create", "delete"])),
		check(
			"deleteOperation_check",
			or(
				and(
					eq(table.operationType, "delete"),
					eq(sql`num_nonnulls(${table.memberId}, ${table.frontId})`, 0),
					isNotNull(table.deletedId),
					isNull(table.data),
				),
				and(
					not(eq(table.operationType, "delete")),
					eq(sql`num_nonnulls(${table.memberId}, ${table.frontId})`, 1),
					isNull(table.deletedId),
					isNotNull(table.data),
				),
			) as SQL,
		),
	],
);
export type Log = typeof logs.$inferSelect;
export type LogCreate = typeof logs.$inferInsert;
export type LogUpdate = Partial<LogCreate>;
