import { defineRelations } from "drizzle-orm";
import { models } from "./schema/index.js";

export const relations = defineRelations(models, (r) => ({
	users: {
		sessions: r.many.sessions(),
		logs: r.many.logs(),
		members: r.many.members(),
		fronts: r.many.fronts(),
		emailChangeRequest: r.one.serverUserEmailChangeRequest(),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id,
		}),
	},
	serverUserEmailChangeRequest: {
		user: r.one.users({
			from: r.serverUserEmailChangeRequest.userId,
			to: r.users.id,
		}),
	},
	logs: {
		user: r.one.users({
			from: r.logs.userId,
			to: r.users.id,
		}),
		member: r.one.members({
			from: [r.logs.userId, r.logs.memberId],
			to: [r.members.userId, r.members.id],
		}),
		front: r.one.fronts({
			from: [r.logs.userId, r.logs.frontId],
			to: [r.fronts.userId, r.fronts.id],
		}),
	},
	members: {
		user: r.one.users({
			from: r.members.userId,
			to: r.users.id,
		}),
		fronts: r.many.fronts(),
		logs: r.many.logs(),
	},
	fronts: {
		user: r.one.users({
			from: r.fronts.userId,
			to: r.users.id,
		}),
		member: r.one.members({
			from: [r.fronts.userId, r.fronts.memberId],
			to: [r.members.userId, r.members.id],
		}),
		logs: r.many.logs(),
	},
}));
