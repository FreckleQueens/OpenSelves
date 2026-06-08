import { foreignKey, primaryKey, camelCase, text, timestamp } from "drizzle-orm/pg-core";
import { id } from "./utils.js";
import { users } from "./users.js";
import { members } from "./members.js";

export const fronts = camelCase.table(
	"fronts",
	{
		userId: text()
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
			}),
		...id(),
		memberId: text().notNull(),
		startedAt: timestamp().notNull(),
		endedAt: timestamp(),
		note: text(),
		createdAt: timestamp().notNull(),
		updatedAt: timestamp().notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.id],
		}),
		foreignKey({
			columns: [table.userId, table.memberId],
			foreignColumns: [members.userId, members.id],
		}).onDelete("cascade"),
	],
);
export type Front = typeof fronts.$inferSelect;
export type FrontCreate = typeof fronts.$inferInsert;
export type FrontUpdate = Partial<FrontCreate>;
