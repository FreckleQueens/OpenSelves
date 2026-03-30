import { pgTable, text } from "drizzle-orm/pg-core";
import { idPrimaryKey, timestamps } from "./utils.js";

export const users = pgTable("users", {
	...idPrimaryKey,
	email: text().notNull().unique(),
	passwordHash: text().notNull(),
	...timestamps,
});
export type User = typeof users.$inferSelect;
export type UserCreate = typeof users.$inferInsert;
