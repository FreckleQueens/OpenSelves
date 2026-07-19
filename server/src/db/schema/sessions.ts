import { boolean, camelCase, text } from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { timestamps } from "./utils.js";

export const sessions = camelCase.table("sessions", {
	token: text().notNull().unique().primaryKey(),
	userId: text()
		.notNull()
		.references(() => users.id, {
			onDelete: "cascade",
		}),
	persist: boolean().notNull().default(false),
	...timestamps(),
});
export type Session = typeof sessions.$inferSelect;
export type SessionCreate = typeof sessions.$inferInsert;
export type SessionUpdate = Partial<SessionCreate>;
