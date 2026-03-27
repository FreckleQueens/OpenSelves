import { json, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "./utils.js";
import { members } from "./members.js";

export const logOperationType = pgEnum("logOperationType", ["create", "update", "delete"]);
export const logs = pgTable("logs", {
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
});
export type Log = typeof logs.$inferSelect;
export type LogCreate = typeof logs.$inferInsert;
