import { pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./utils.js";
import { users } from "./users.js";

export const sessions = pgTable("sessions", {
	token: text().notNull().unique().primaryKey(),
	userId: text()
		.notNull()
		.references(() => users.id, {
			onDelete: "cascade",
		}),
	...timestamps,
});
export type Session = typeof sessions.$inferSelect;
export type SessionCreate = typeof sessions.$inferInsert;
