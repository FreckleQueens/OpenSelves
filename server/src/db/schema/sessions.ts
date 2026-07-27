import { boolean, bytea, camelCase, text } from "drizzle-orm/pg-core";
import type { ByteString } from "openselves-common/willow";

import { timestamps } from "./utils.js";

export const sessions = camelCase.table("sessions", {
	token: text().notNull().unique().primaryKey(),
	userKey: bytea().notNull().$type<ByteString>(),
	persist: boolean().notNull().default(false),
	...timestamps(),
});
export type Session = typeof sessions.$inferSelect;
export type SessionCreate = typeof sessions.$inferInsert;
export type SessionUpdate = Partial<SessionCreate>;
