import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./utils.js";
import { users } from "./users.js";

export const members = pgTable("members", {
	...id,
	userId: text()
		.notNull()
		.references(() => users.id, {
			onDelete: "cascade",
		}),
	name: text().notNull(),
	pronouns: text().notNull(),
	description: text().notNull(),
	...timestamps,
	isArchived: boolean().notNull().default(false),
	archivedReason: text(),
});
export type Member = typeof members.$inferSelect;
export type MemberCreate = typeof members.$inferInsert;
