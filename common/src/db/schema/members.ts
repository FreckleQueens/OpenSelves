import { boolean, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./utils.js";
import { users } from "./users.js";

export const members = pgTable(
	"members",
	{
		userId: text()
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
			}),
		...id,
		name: text().notNull(),
		pronouns: text().notNull(),
		description: text().notNull(),
		...timestamps,
		isArchived: boolean().notNull().default(false),
		archivedReason: text(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.id],
		}),
	],
);
export type Member = typeof members.$inferSelect;
export type MemberCreate = typeof members.$inferInsert;
