import { defineRelations } from "drizzle-orm";

import { models } from "./schema/index.js";

export const relations = defineRelations(models, (r) => ({
	users: {
		sessions: r.many.sessions(),
		entries: r.many.entries(),
		emailChangeRequest: r.one.userEmailChangeRequest(),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id,
		}),
	},
	userEmailChangeRequest: {
		user: r.one.users({
			from: r.userEmailChangeRequest.userId,
			to: r.users.id,
		}),
	},
	entries: {
		user: r.one.users({
			from: r.entries.subspaceId,
			to: r.users.id,
		}),
	},
}));
