import { camelCase, text } from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { createdAt, idPrimaryKey } from "./utils.js";

export const userEmailChangeRequest = camelCase.table("user_email_change_request", {
	userId: idPrimaryKey().id.references(() => users.id, {
		onDelete: "cascade",
	}),
	email: text().notNull(),
	...createdAt(),
});
export type UserEmailChangeRequest = typeof userEmailChangeRequest.$inferSelect;
export type UserEmailChangeRequestCreate = typeof userEmailChangeRequest.$inferInsert;
export type UserEmailChangeRequestUpdate = Partial<UserEmailChangeRequestCreate>;
