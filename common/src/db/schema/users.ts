import { pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamps } from "./utils.js";

export const users = pgTable("users", {
	...id,
	email: text().notNull().unique(),
	passwordHash: text().notNull(),
	...timestamps,
});
export type User = typeof users.$inferSelect;
export type UserCreate = typeof users.$inferInsert;
