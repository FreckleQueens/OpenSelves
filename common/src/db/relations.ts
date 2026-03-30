import { defineRelations } from "drizzle-orm";
import { models } from "./schema/index.js";

export const relations = defineRelations(models, (r) => ({
	users: {
		sessions: r.many.sessions(),
		logs: r.many.logs(),
		members: r.many.members(),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id,
		}),
	},
	logs: {
		user: r.one.users({
			from: r.logs.userId,
			to: r.users.id,
		}),
		member: r.one.members({
			from: r.logs.memberId,
			to: r.members.id,
		}),
	},
	members: {
		user: r.one.users({
			from: r.members.userId,
			to: r.users.id,
		}),
		logs: r.many.logs(),
	},
}));
