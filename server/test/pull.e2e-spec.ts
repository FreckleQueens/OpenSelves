import { type Log, type LogCreate, type Member, members, models } from "openselves-common/db";
import request from "supertest";

import { type TestEnv, setupTestSuite } from "./utils.js";

const pullEndpoint = "/sync/pull";

describe("/sync/pull", () => {
	let env: TestEnv;
	let members1: Member[];
	let members2: Member[];
	let logs1: Log[];
	setupTestSuite((testEnv) => (env = testEnv));

	beforeAll(async () => {
		members1 = await env.db
			.insert(members)
			.values([
				{
					userId: env.users.user.id,
					name: "Alice",
					pronouns: "she/her",
					description: "a member of our& system",
				},
				{
					userId: env.users.user.id,
					name: "Bob",
					pronouns: "he/him",
					description: "another member of our& system",
				},
			])
			.returning();
		members2 = await env.db
			.insert(members)
			.values([
				{
					userId: env.users.user2.id,
					name: "Claire",
					pronouns: "they/them",
					description: "someone else somewhere else",
				},
			])
			.returning();

		logs1 = await env.db
			.insert(models.logs)
			.values([
				...members1.map((member) => {
					const { id, userId, ...memberData } = member;
					const log: LogCreate = {
						userId: userId,
						memberId: id,
						operationType: "create",
						data: memberData,
						executedAt: member.createdAt,
						pushedAt: member.createdAt,
					};
					return log;
				}),
				{
					userId: env.users.user.id,
					memberId: members1[0].id,
					operationType: "update",
					data: {
						name: "a new name",
					},
					executedAt: new Date(),
					pushedAt: new Date(),
				},
				{
					userId: env.users.user.id,
					memberId: members1[1].id,
					operationType: "update",
					data: {
						description: "a new description",
					},
					executedAt: new Date(),
					pushedAt: new Date(),
				},
			])
			.returning();

		await env.db.insert(models.logs).values([
			...members2.map((member) => {
				const { id, userId, ...memberData } = member;
				const log: LogCreate = {
					userId: userId,
					memberId: id,
					operationType: "create",
					data: memberData,
					executedAt: member.createdAt,
					pushedAt: member.createdAt,
				};
				return log;
			}),
			{
				userId: env.users.user2.id,
				memberId: members2[0].id,
				operationType: "update",
				data: {
					pronouns: "rad/af",
				},
				executedAt: new Date(),
				pushedAt: new Date(),
			},
		]);
	});

	test("GET 404", async () => {
		await request(env.server).get(pullEndpoint).expect(404);
	});

	test("PUT 404", async () => {
		await request(env.server).put(pullEndpoint).send({}).expect(404);
	});

	test("PATCH 404", async () => {
		await request(env.server).patch(pullEndpoint).send({}).expect(404);
	});

	test("DELETE 404", async () => {
		await request(env.server).delete(pullEndpoint).send({}).expect(404);
	});

	describe("POST", () => {
		test("empty request body 400", async () => {
			const response = await request(env.server)
				.post(pullEndpoint)
				.send({})
				.set("Cookie", env.users.cookies)
				.expect(400)
				.expect("Content-type", /json/);
			expect(response.body.logs).toBeUndefined();
		});

		async function callPull(timestamp: number | "init", expectCode: number, cookies: string) {
			return await request(env.server)
				.post(pullEndpoint)
				.send({
					timestamp: timestamp,
				})
				.set("Cookie", cookies)
				.expect(expectCode)
				.expect("Content-type", /json/);
		}

		async function callPullAndGetLogs(
			timestamp: number | "init",
			expectCode: number,
			cookies: string,
		) {
			const date = new Date();
			const response = await callPull(timestamp, expectCode, cookies);
			const responseTimestamp = new Date(response.body.timestamp).getTime();
			expect(Number.isFinite(responseTimestamp)).toBe(true);
			expect((responseTimestamp - date.getTime()) / 1000).toBeCloseTo(0, 0);

			const logs: unknown[] = response.body.logs;
			expect(logs).toBeDefined();
			expect(logs).toBeInstanceOf(Array);
			return logs;
		}

		test("initial sync 200", async () => {
			const date = new Date();

			const logs = await callPullAndGetLogs("init", 200, env.users.cookies);

			expect(logs.length).toBe(2);
			for (let i = 0; i < logs.length; i++) {
				const log: Log = logs[i] as Log;
				const member = members1[i];
				expect(log).toMatchObject({
					memberId: member.id,
					operationType: "create",
				});

				const { id, userId, createdAt, updatedAt, ...memberData } = member;
				expect(log.data).toStrictEqual({
					...memberData,
					createdAt: createdAt.toISOString(),
					updatedAt: updatedAt.toISOString(),
				});

				expect(typeof log.id).toBe("string");
				expect(log.id.length).toBeGreaterThan(0);

				const executedAt = new Date(log.executedAt).getTime();
				expect(Number.isFinite(executedAt)).toBe(true);
				expect((executedAt - date.getTime()) / 1000).toBeCloseTo(0, 0);

				const pushedAt = new Date(log.pushedAt).getTime();
				expect(Number.isFinite(pushedAt)).toBe(true);
				expect((pushedAt - date.getTime()) / 1000).toBeCloseTo(0, 0);

				expect(log.userId).toBeUndefined();
				expect(log.deletedId).toBeUndefined();
			}
		});

		test("serves all logs after timestamp 200", async () => {
			const date = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10 hours ago

			const logs = await callPullAndGetLogs(date.getTime(), 200, env.users.cookies);

			expect(logs.length).toBe(logs1.length);
			for (let i = 0; i < logs.length; i++) {
				const log: Log = logs[i] as Log;
				const { userId, deletedId, executedAt, pushedAt, ...expectedLog }: Log = logs1[i];
				expect(log).toStrictEqual({
					...expectedLog,
					executedAt: executedAt.toISOString(),
					pushedAt: pushedAt.toISOString(),
				});
			}
		});

		test("refuses negative timestamp 400", async () => {
			const response = await callPull(-1, 400, env.users.cookies);
			expect(response.body.timestamp).not.toBeDefined();
			expect(response.body.logs).not.toBeDefined();
		});

		test("refuses timestamp in the future 400", async () => {
			const response = await callPull(
				Date.now() + 10 * 60 * 60 * 1000, // 10 hours from now
				400,
				env.users.cookies,
			);
			expect(response.body.timestamp).not.toBeDefined();
			expect(response.body.logs).not.toBeDefined();
		});
	});
});
