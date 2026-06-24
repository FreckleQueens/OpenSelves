import { camelCase, text } from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { createdAt, idPrimaryKey } from "./utils.js";

export const serverUserEmailChangeRequest = camelCase.table("server_user_email_change_request", {
	userId: idPrimaryKey().id.references(() => users.id, {
		onDelete: "cascade",
	}),
	email: text().notNull(),
	...createdAt(),
});
export type ServerUserEmailChangeRequest = typeof serverUserEmailChangeRequest.$inferSelect;
export type ServerUserEmailChangeRequestCreate = typeof serverUserEmailChangeRequest.$inferInsert;
export type ServerUserEmailChangeRequestUpdate = Partial<ServerUserEmailChangeRequestCreate>;
