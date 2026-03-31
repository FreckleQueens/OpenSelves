import { createId } from "@paralleldrive/cuid2";
import type { Log, Member, MemberCreate } from "openselves-common/db";
import request from "supertest";

import { type TestEnv, setupTestSuite } from "./utils.js";

const pushEndpoint = "/sync/push";
const pullEndpoint = "/sync/pull";

type CreateLogWithPushedAt = Omit<Log, "userId" | "deletedId" | "memberId"> & {
	memberId: string;
};
type CreateLog = Omit<CreateLogWithPushedAt, "pushedAt">;

describe(pushEndpoint, () => {
	let env: TestEnv;

	function makeMemberWithLog(date: Date) {
		const member: Omit<MemberCreate, "userId"> = {
			name: "Alice",
			pronouns: "she/her",
			description: "a member of our& system",
			isArchived: false,
			archivedReason: null,
		};
		const createLog: CreateLog = {
			id: createId(),
			memberId: createId(),
			operationType: "create",
			data: member,
			executedAt: date,
		};
		return { member, createLog, date };
	}

	async function createMember() {
		const { createLog } = makeMemberWithLog(new Date());
		const response = await request(env.server)
			.put(pushEndpoint)
			.send({
				logs: [createLog],
			})
			.set("Cookie", env.users.cookies)
			.expect(200)
			.expect("Content-Type", /json/);
		const outputLog = response.body.logs[0];
		await checkLogIsServed(outputLog);
		return { createLog, outputLog };
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
		expect(pulledLog).toEqual(logToCheck);
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
			const createLogWithPushedAt: CreateLogWithPushedAt = {
				...createLog,
				pushedAt: date,
			};
			await request(env.server)
				.put(pushEndpoint)
				.set("Cookie", env.users.cookies)
				.send({ logs: [createLogWithPushedAt] })
				.expect(400);
		});
		test("log data with userId 400", async () => {
			const { createLog } = makeMemberWithLog(new Date());
			await request(env.server)
				.put(pushEndpoint)
				.set("Cookie", env.users.cookies)
				.send({
					logs: [
						{
							...createLog,
							data: { ...(createLog.data as Member), userId: env.users.user2.id },
						},
					],
				})
				.expect(400);
		});

		describe("PUT create Member", () => {
			test("200", async () => {
				const { member, createLog, date } = makeMemberWithLog(new Date());

				const response = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				expect(response.body.logs).toBeInstanceOf(Array);
				expect(response.body.logs.length).toBe(1);
				const outputLog = response.body.logs[0];
				expect(typeof outputLog).toBe("object");
				expect(outputLog).toMatchObject({
					id: createLog.id,
					memberId: createLog.memberId,
					operationType: "create",
					data: member,
					executedAt: date.toISOString(),
				});

				checkForPushedAt(outputLog);
				await checkLogIsServed(outputLog);
			});

			test("send create operation twice returns existing log 200", async () => {
				const { createLog } = makeMemberWithLog(new Date());
				const response = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				const outputLog = response.body.logs[0];

				const response2 = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				expect(response2.body.logs[0]).toEqual(outputLog);
			});

			test("create member with same id fails 409", async () => {
				const { createLog } = makeMemberWithLog(new Date());
				const { createLog: createLog2 } = makeMemberWithLog(new Date());
				createLog2.memberId = createLog.memberId;

				await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);

				await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog2],
					})
					.set("Cookie", env.users.cookies)
					.expect(409)
					.expect("Content-Type", /json/);
			});
		});

		describe("PUT delete Member", () => {
			async function createAndDeleteMember() {
				const { member, createLog } = makeMemberWithLog(new Date());

				await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);

				const { data, ...deleteLog } = createLog;
				deleteLog.id = createId();
				deleteLog.operationType = "delete";
				deleteLog.executedAt = new Date();
				const response = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [deleteLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				return { member, deleteLog, response };
			}

			test("200", async () => {
				const { deleteLog, response } = await createAndDeleteMember();
				expect(response.body.logs).toBeInstanceOf(Array);
				expect(response.body.logs.length).toBe(1);
				const outputLog = response.body.logs[0];
				expect(typeof outputLog).toBe("object");
				expect(outputLog).toMatchObject({
					id: deleteLog.id,
					memberId: deleteLog.memberId,
					operationType: "delete",
					executedAt: deleteLog.executedAt.toISOString(),
				});

				checkForPushedAt(outputLog);
				await checkLogIsServed(outputLog);
			});

			test("delete member from 2 different clients returns stored log 200", async () => {
				const { deleteLog, response } = await createAndDeleteMember();
				const outputLog = response.body.logs[0];

				deleteLog.id = createId();
				const response2 = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [deleteLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				expect(response2.body.logs[0].id).not.toBe(deleteLog.id);
				expect(response2.body.logs[0]).toEqual(outputLog);
			});

			test("delete member of another user fails 404", async () => {
				const { createLog, outputLog } = await createMember();

				const deleteLog = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "delete",
					data: undefined,
					executedAt: new Date(),
				};
				const response2 = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [deleteLog],
					})
					.set("Cookie", env.users.cookies2)
					.expect(404)
					.expect("Content-Type", /json/);
				expect(response2.body.logs).toBe(undefined);

				// Check member was not deleted
				await checkLogIsServed(outputLog);
			});

			test("retrieve log from another user fails 404", async () => {
				const { createLog } = makeMemberWithLog(new Date());
				const response = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				await checkLogIsServed(response.body.logs[0]);

				const deleteLog = {
					id: createLog.id,
					memberId: createId(),
					operationType: "delete",
					data: undefined,
					executedAt: new Date(),
				};
				const response2 = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [deleteLog],
					})
					.set("Cookie", env.users.cookies2)
					.expect(404)
					.expect("Content-Type", /json/);
				expect(response2.body.logs).toBe(undefined);
			});
		});

		describe("PUT update Member", () => {
			test("200", async () => {
				const { createLog } = makeMemberWithLog(new Date());

				await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);

				const date = new Date();
				const updateLog = {
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
				const response = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [updateLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				expect(response.body.logs).toBeInstanceOf(Array);
				expect(response.body.logs.length).toBe(1);
				const outputLog = response.body.logs[0];
				expect(typeof outputLog).toBe("object");
				expect(outputLog).toMatchObject({
					id: updateLog.id,
					memberId: createLog.memberId,
					operationType: "update",
					executedAt: date.toISOString(),
				});
				expect(outputLog.data).toEqual(updateLog.data);

				checkForPushedAt(outputLog);
				await checkLogIsServed(outputLog);

				const dbRecord = await env.db.query.members.findFirst({
					where: {
						userId: env.users.user.id,
						id: createLog.memberId,
					},
				});

				// TODO: check for create logs on /sync/pull instead
				expect(dbRecord).toBeDefined();
				expect(dbRecord).toMatchObject(updateLog.data);
			});

			test("empty update data 400", async () => {
				const { createLog } = makeMemberWithLog(new Date());

				await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [createLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);

				const date = new Date();
				const updateLog = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "update",
					data: {},
					executedAt: date,
				};
				const response = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [updateLog],
					})
					.set("Cookie", env.users.cookies)
					.expect(400)
					.expect("Content-Type", /json/);
				expect(response.body.logs).not.toBeDefined();
			});

			test("update member of another user fails 404", async () => {
				const { createLog, outputLog } = await createMember();

				const updateLog = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "update",
					data: {
						name: "a new name",
					},
					executedAt: new Date(),
				};
				const response2 = await request(env.server)
					.put(pushEndpoint)
					.send({
						logs: [updateLog],
					})
					.set("Cookie", env.users.cookies2)
					.expect(404)
					.expect("Content-Type", /json/);
				expect(response2.body.logs).toBe(undefined);

				// Check member was not deleted
				expect(outputLog.data.name).not.toBe(updateLog.data.name);
				await checkLogIsServed(outputLog);
			});
		});

		// TODO: update member that was deleted returns a delete operation
		// TODO: multiple logs at once
	});
});
