import { camelCase, integer, json, text, timestamp } from "drizzle-orm/pg-core";
import { idPrimaryKey, timestamps } from "./utils.js";

export const serverJobs = camelCase.table("server_jobs", {
	...idPrimaryKey(),

	type: text().notNull(),
	data: json().notNull(),
	attempts: integer().notNull(),
	scheduledAt: timestamp().notNull(),
	completedAt: timestamp(),

	...timestamps(),
});
export type ServerJob = typeof serverJobs.$inferSelect;
export type ServerJobCreate = typeof serverJobs.$inferInsert;
export type ServerJobUpdate = Partial<ServerJobCreate>;
