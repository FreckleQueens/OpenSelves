import { createId } from "@paralleldrive/cuid2";
import type { Log, Member, MemberCreate } from "openselves-common/db";
import request from "supertest";

import { type TestEnv, setupTestSuite } from "./utils.js";

const pushEndpoint = "/sync/push";
const pullEndpoint = "/sync/pull";

type ClientLogWithPushedAt = Omit<Log, "userId" | "deletedId" | "memberId"> & {
	memberId: string;
};
type ClientLog = Omit<ClientLogWithPushedAt, "pushedAt">;

describe(pushEndpoint, () => {
	let env: TestEnv;

	function makeMemberWithLog(date: Date) {
		const member: Omit<MemberCreate, "userId" | "id"> = {
			name: "Alice",
			pronouns: "she/her",
			description: "a member of our& system",
			isArchived: false,
			archivedReason: null,
		};
		const createLog: ClientLog = {
			id: createId(),
			memberId: createId(),
			operationType: "create",
			data: member,
			executedAt: date,
		};
		return { member, createLog, date };
	}

	async function putLog(
		log: ClientLog,
		expect: number = 200,
		cookies: string = env.users.cookies,
	) {
		return putLogs([log], expect, cookies);
	}

	async function putLogs(
		logs: ClientLog[],
		expect: number = 200,
		cookies: string = env.users.cookies,
	) {
		return await request(env.server)
			.put(pushEndpoint)
			.send({
				logs: logs,
			})
			.set("Cookie", cookies)
			.expect(expect)
			.expect("Content-Type", /json/);
	}

	async function createMember() {
		const { member, createLog } = makeMemberWithLog(new Date());
		const response = await putLog(createLog);
		expect(response.body.logs).not.toBeDefined();
		await checkLogIsServed(createLog);
		return { member, createLog };
	}
	async function createAndDeleteMember() {
		const { member, createLog } = await createMember();

		const deleteLog: ClientLog = {
			...createLog,
			id: createId(),
			operationType: "delete",
			data: null,
			executedAt: new Date(),
		};
		const response = await putLog(deleteLog);
		return { member, deleteLog, response };
	}

	function checkForPushedAt(log: Record<string, unknown>) {
		expect(log.pushedAt).toBeDefined();
		expect(typeof log.pushedAt).toBe("string");
		expect(typeof Date.parse(log.pushedAt as string)).toBe("number");
		const pushedAt = new Date(log.pushedAt as string);
		expect((Date.now() - pushedAt.getTime()) / 1000).toBeCloseTo(0, 0);
	}

	async function checkLogIsServed(logToCheck: Record<string, unknown>) {
		const response = await request(env.server)
			.post(pullEndpoint)
			.send({})
			.set("Cookie", env.users.cookies)
			.expect(200)
			.expect("Content-Type", /json/);
		expect(response.body.logs).toBeInstanceOf(Array);
		expect(response.body.logs.length).toBeGreaterThanOrEqual(1);
		const pulledLogs = response.body.logs as Array<unknown>;
		const pulledLog = pulledLogs.find(
			(log) => log && typeof log === "object" && "id" in log && log.id === logToCheck.id,
		);
		expect(pulledLog).toBeDefined();
		expect(pulledLog).toMatchObject(
			Object.fromEntries(
				Object.entries(logToCheck).map(([key, value]) => {
					if (value instanceof Date) {
						value = value.toISOString();
					}
					return [key, value];
				}),
			),
		);
		checkForPushedAt(pulledLog as Record<string, unknown>);
	}

	setupTestSuite((testEnv) => (env = testEnv));

	test("GET 404", async () => {
		await request(env.server).get(pushEndpoint).expect(404);
	});

	test("POST 404", async () => {
		await request(env.server).post(pushEndpoint).send({}).expect(404);
	});

	test("PATCH 404", async () => {
		await request(env.server).patch(pushEndpoint).send({}).expect(404);
	});

	test("DELETE 404", async () => {
		await request(env.server).delete(pushEndpoint).send({}).expect(404);
	});

	describe("PUT", () => {
		test("empty request body 400", async () => {
			await request(env.server)
				.put(pushEndpoint)
				.set("Cookie", env.users.cookies)
				.send({})
				.expect(400);
		});
		test("empty logs array 400", async () => {
			await request(env.server)
				.put(pushEndpoint)
				.set("Cookie", env.users.cookies)
				.send({ logs: [] })
				.expect(400);
		});
		test("log with non-null pushedAt 400", async () => {
			const { createLog, date } = makeMemberWithLog(new Date());
			const createLogWithPushedAt: ClientLogWithPushedAt = {
				...createLog,
				pushedAt: date,
			};
			await putLog(createLogWithPushedAt, 400);
		});
		test("log data with userId 400", async () => {
			const { createLog } = makeMemberWithLog(new Date());
			await putLog(
				{
					...createLog,
					data: { ...(createLog.data as Member), userId: env.users.user2.id },
				},
				400,
			);
		});

		describe("PUT create Member", () => {
			test("200", async () => {
				const { createLog } = makeMemberWithLog(new Date());

				await putLog(createLog);
				await checkLogIsServed(createLog);
			});

			test("send create operation twice succeeds 200", async () => {
				const { createLog } = makeMemberWithLog(new Date());
				await putLog(createLog);
				await putLog(createLog);
			});

			test("create member with same id fails 409", async () => {
				const { createLog } = makeMemberWithLog(new Date());
				const { createLog: createLog2 } = makeMemberWithLog(new Date());
				createLog2.memberId = createLog.memberId;

				await putLog(createLog);

				await putLog(createLog2, 409);
			});
		});

		describe("PUT delete Member", () => {
			test("200", async () => {
				const { deleteLog } = await createAndDeleteMember();
				await checkLogIsServed(deleteLog);
			});

			test("delete member from 2 different clients (same user) succeeds 200", async () => {
				const { deleteLog } = await createAndDeleteMember();

				deleteLog.id = createId();
				await putLog(deleteLog);
			});

			test("delete member of another user fails 404", async () => {
				const { createLog } = await createMember();

				const deleteLog: ClientLog = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "delete",
					data: undefined,
					executedAt: new Date(),
				};
				const response2 = await putLog(deleteLog, 404, env.users.cookies2);
				expect(response2.body.logs).toBe(undefined);

				// Check member was not deleted
				await checkLogIsServed(createLog);
			});

			test("retrieve log from another user fails 404", async () => {
				const { createLog } = await createMember();

				const deleteLog: ClientLog = {
					id: createLog.id,
					memberId: createId(),
					operationType: "delete",
					data: undefined,
					executedAt: new Date(),
				};
				const response2 = await putLog(deleteLog, 404, env.users.cookies2);
				expect(response2.body.logs).toBe(undefined);
			});
		});

		describe("PUT update Member", () => {
			test("200", async () => {
				const { createLog } = makeMemberWithLog(new Date());

				await putLog(createLog);

				const date = new Date();
				const updateLog: ClientLog = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "update",
					data: {
						pronouns: "she/they",
						description: "a member of our& system who went through some changes",
						isArchived: true,
						archivedReason: "a reason for archival",
					},
					executedAt: date,
				};
				await putLog(updateLog);

				await checkLogIsServed(updateLog);

				const dbRecord = await env.db.query.members.findFirst({
					where: {
						userId: env.users.user.id,
						id: createLog.memberId,
					},
				});

				// TODO@pull: check for create logs on /sync/pull instead
				expect(dbRecord).toBeDefined();
				expect(dbRecord).toMatchObject(updateLog.data as Record<string, unknown>);
			});

			test("empty update data 400", async () => {
				const { createLog } = makeMemberWithLog(new Date());

				await putLog(createLog);

				const date = new Date();
				const updateLog: ClientLog = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "update",
					data: {},
					executedAt: date,
				};
				const response = await putLog(updateLog, 400);
				expect(response.body.logs).not.toBeDefined();
			});

			test("update member of another user fails 404", async () => {
				const { createLog } = await createMember();

				const updateLog: ClientLog = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "update",
					data: {
						name: "a new name",
					},
					executedAt: new Date(),
				};
				const response2 = await putLog(updateLog, 404, env.users.cookies2);

				expect(response2.body.logs).toBe(undefined);

				// Check member was not deleted
				expect(createLog.data).toBeDefined();
				const createName = (createLog.data as Record<string, unknown>)["name"];
				expect(createName).toBeDefined();
				expect(createName).not.toBe((updateLog.data as Record<string, unknown>).name);
				await checkLogIsServed(createLog);
			});

			test("update member that was already deleted succeeds 200", async () => {
				const { deleteLog } = await createAndDeleteMember();
				const updateLog: ClientLog = {
					id: createId(),
					memberId: deleteLog.memberId,
					operationType: "update",
					data: {
						name: "a new name",
					},
					executedAt: new Date(),
				};

				await putLog(updateLog);
			});
		});

		test("PUT create, update and delete members all at once 200", async () => {
			const memberToDelete = makeMemberWithLog(new Date(0));
			await putLog(memberToDelete.createLog);
			const members = [
				makeMemberWithLog(new Date(1)),
				makeMemberWithLog(new Date(2)),
				makeMemberWithLog(new Date(4)),
			];
			const logs: ClientLog[] = [
				members[0].createLog,
				members[1].createLog,
				{
					id: createId(),
					operationType: "update",
					memberId: members[1].createLog.memberId,
					data: {
						description: "a new description",
					},
					executedAt: new Date(3),
				},
				members[2].createLog,
				{
					id: createId(),
					operationType: "update",
					memberId: members[0].createLog.memberId,
					data: {
						pronouns: "iel/ellui",
					},
					executedAt: new Date(5),
				},
				{
					id: createId(),
					operationType: "delete",
					memberId: memberToDelete.createLog.memberId,
					data: undefined,
					executedAt: new Date(6),
				},
				{
					id: createId(),
					operationType: "update",
					memberId: members[2].createLog.memberId,
					data: {
						pronouns: "they/them",
						isArchived: true,
						archivedReason: "a reason",
					},
					executedAt: new Date(7),
				},
			];

			await putLogs(logs);

			const dbRecords = await env.db.query.members.findMany({
				where: {
					userId: env.users.user.id,
					id: {
						in: [memberToDelete.createLog.memberId, ...logs.map((log) => log.memberId)],
					},
				},
			});
			expect(dbRecords.length).toBe(3);
			for (const record of dbRecords) {
				const member = members.find((member) => member.createLog.memberId === record.id);
				expect(member).toBeDefined();

				let expectedData = Object.assign({}, member?.createLog.data);
				for (const log of logs) {
					if (log.memberId === member?.createLog.memberId) {
						expectedData = Object.assign(expectedData, log.data);
					}
				}
				expect(record).toMatchObject(expectedData);
			}
		});

		test("PUT out of order logs 400", async () => {
			const members = [
				makeMemberWithLog(new Date(1)),
				makeMemberWithLog(new Date(2)),
				makeMemberWithLog(new Date(4)),
			];

			const outOfOrderLogs: ClientLog[] = [
				members[1].createLog,
				members[2].createLog,
				members[0].createLog,
			];
			await putLogs(outOfOrderLogs, 400);

			const orderedLogs: ClientLog[] = [
				members[0].createLog,
				members[1].createLog,
				members[2].createLog,
			];
			await putLogs(orderedLogs, 200);
		});

		test("PUT create and delete in one request fails 400", async () => {
			const member = makeMemberWithLog(new Date());

			await putLogs(
				[
					member.createLog,
					{
						...member.createLog,
						id: createId(),
						operationType: "delete",
						data: undefined,
					},
				],
				400,
			);
		});

		test("PUT update and delete in one request fails 400", async () => {
			const member = makeMemberWithLog(new Date());

			await putLog(member.createLog);
			await putLogs(
				[
					{
						...member.createLog,
						id: createId(),
						operationType: "update",
						data: {
							name: "a new name",
						},
					},
					{
						...member.createLog,
						id: createId(),
						operationType: "delete",
						data: undefined,
					},
				],
				400,
			);
		});

		// TODO: strip update logs compared to more recent update logs

		// TODO@pull: /pull only returns create logs on initial sync (no timestamp provided)
	});
});
