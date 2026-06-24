import { boolean, camelCase, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { id } from "./utils.js";

export const members = camelCase.table(
	"members",
	{
		userId: text()
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
			}),
		...id(),
		name: text().notNull(),
		pronouns: text().notNull(),
		description: text().notNull(),
		color: text(),

		image: text(),

		isArchived: boolean().notNull().default(false),
		archivedReason: text(),

		createdAt: timestamp().notNull(),
		updatedAt: timestamp().notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.id],
		}),
	],
);
export type Member = typeof members.$inferSelect;
export type MemberCreate = typeof members.$inferInsert;
export type MemberUpdate = Partial<MemberCreate>;
