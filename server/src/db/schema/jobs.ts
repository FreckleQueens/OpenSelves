import { camelCase, integer, json, text, timestamp } from "drizzle-orm/pg-core";

import { idPrimaryKey, timestamps } from "./utils.js";

export const jobs = camelCase.table("jobs", {
	...idPrimaryKey(),

	type: text().notNull(),
	data: json().notNull(),
	attempts: integer().notNull(),
	scheduledAt: timestamp().notNull(),
	completedAt: timestamp(),

	...timestamps(),
});
export type Job = typeof jobs.$inferSelect;
export type JobCreate = typeof jobs.$inferInsert;
export type JobUpdate = Partial<JobCreate>;
