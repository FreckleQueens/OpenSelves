import { defineRelations } from "drizzle-orm";
import { models } from "./schema/index.js";

export const relations = defineRelations(models, (r) => ({
	users: {
		sessions: r.many.sessions(),
		memberLogs: r.many.logs({
			from: r.users.id.through(r.members.userId),
			to: r.logs.id.through(r.members.id),
			where: {},
		}),
		members: r.many.members(),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id,
		}),
	},
	logs: {
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
