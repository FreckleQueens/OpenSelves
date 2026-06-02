import { boolean, camelCase, text } from "drizzle-orm/pg-core";
import { idPrimaryKey, timestamps } from "./utils.js";
import { sql } from "drizzle-orm";

export const users = camelCase.table("users", {
	...idPrimaryKey,
	email: text().notNull().unique(),
	passwordHash: text().notNull(),
	isEmailVerified: boolean().notNull().default(false),
	emailVerificationToken: text()
		.notNull()
		.default(sql`concat(md5(random()::text), md5(random()::text))`),
	passwordRecoveryToken: text(),
	...timestamps,
});
export type User = typeof users.$inferSelect;
export type UserCreate = typeof users.$inferInsert;
export type UserUpdate = Partial<UserCreate>;
