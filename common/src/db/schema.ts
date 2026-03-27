import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { defineRelations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const timestamps = {
	createdAt: timestamp().notNull().defaultNow(),
	updatedAt: timestamp()
		.notNull()
		.defaultNow()
		.$onUpdateFn(() => new Date()),
};

export const users = pgTable("users", {
	id: text().notNull().unique().primaryKey().$defaultFn(createId),
	email: text().notNull().unique(),
	passwordHash: text().notNull(),
	...timestamps,
});
export type User = typeof users.$inferSelect;
export type UserCreate = typeof users.$inferInsert;

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

export const members = pgTable("members", {
	id: text().notNull().unique().primaryKey().$defaultFn(createId),
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

export const models = {
	users,
	sessions,
	members,
};

export const relations = defineRelations(models, (r) => ({
	users: {
		sessions: r.many.sessions(),
		members: r.many.members(),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id,
		}),
	},
	members: {
		user: r.one.users({
			from: r.members.userId,
			to: r.users.id,
		}),
	},
}));
