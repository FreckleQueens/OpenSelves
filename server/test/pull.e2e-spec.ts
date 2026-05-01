import { beforeAll, describe, expect, test } from "@jest/globals";
import { eq } from "drizzle-orm";
import { type Log, type LogCreate, type Member, members, models } from "openselves-common/db";

import { type TestEnv, setupTestSuite } from "./utils.js";

const pullEndpoint = "/sync/pull";

describe("/sync/pull", () => {
	let env: TestEnv;
	let members1: Member[];
	let deletedMember1: Member;
	let members2: Member[];
	let logs1: Log[];
	setupTestSuite((testEnv) => (env = testEnv));

	beforeAll(async () => {
		let timestamp: number = Date.now() - 1000;
		const getDate = () => new Date(timestamp++);
		members1 = await env.db
			.insert(members)
			.values([
				{
					userId: env.users.user.id,
					name: "Alice",
					pronouns: "she/her",
					description: "a member of our& system",
					createdAt: getDate(),
					updatedAt: getDate(),
				},
				{
					userId: env.users.user.id,
					name: "Bob",
					pronouns: "he/him",
					description: "another member of our& system",
					createdAt: getDate(),
					updatedAt: getDate(),
				},
			])
			.returning();
		deletedMember1 = (
			await env.db
				.insert(members)
				.values([
					{
						userId: env.users.user.id,
						name: "Dex",
						pronouns: "they/them",
						description: "a deleted member of our& system",
						createdAt: getDate(),
						updatedAt: getDate(),
					},
				])
				.returning()
		)[0];
		await env.db.delete(members).where(eq(members.id, deletedMember1.id));

		members2 = await env.db
			.insert(members)
			.values([
				{
					userId: env.users.user2.id,
					name: "Claire",
					pronouns: "they/them",
					description: "someone else somewhere else",
					createdAt: getDate(),
					updatedAt: getDate(),
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
					executedAt: getDate(),
					pushedAt: getDate(),
				},
				{
					userId: env.users.user.id,
					memberId: members1[1].id,
					operationType: "update",
					data: {
						description: "a new description",
					},
					executedAt: getDate(),
					pushedAt: getDate(),
				},
				{
					userId: env.users.user.id,
					deletedId: `members.${deletedMember1.id}`,
					operationType: "delete",
					data: null,
					executedAt: getDate(),
					pushedAt: getDate(),
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
				executedAt: getDate(),
				pushedAt: getDate(),
			},
		]);
	});

	test("GET 404", async () => {
		await env.request.get(pullEndpoint).expect(404);
	});

	test("PUT 404", async () => {
		await env.request.put(pullEndpoint).send({}).expect(404);
	});

	test("PATCH 404", async () => {
		await env.request.patch(pullEndpoint).send({}).expect(404);
	});

	test("DELETE 404", async () => {
		await env.request.delete(pullEndpoint).send({}).expect(404);
	});

	describe("POST", () => {
		test("empty request body 400", async () => {
			const response = await env.request
				.post(pullEndpoint)
				.send({})
				.set("Cookie", env.users.cookies)
				.expect(400)
				.expect("Content-type", /json/);
			expect(response.body.logs).toBeUndefined();
		});

		async function callPull(timestamp: number | "init", expectCode: number, cookies: string) {
			return env.request
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

			const members = [...members1];
			const logs = await callPullAndGetLogs("init", 200, env.users.cookies);

			expect(logs.length).toBe(members.length + 1);
			for (let i = 0; i < members.length; i++) {
				const log: Log = logs[i] as Log;
				const member = members[i];
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

				expect(log.userId).toBeUndefined();
				expect(log.deletedId).toBeUndefined();
			}

			expect(logs[logs.length - 1]).toMatchObject({
				memberId: deletedMember1.id,
				operationType: "delete",
				data: null,
			});
		});

		test("serves all logs after timestamp 200", async () => {
			const date = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10 hours ago

			const logs = await callPullAndGetLogs(date.getTime(), 200, env.users.cookies);

			expect(logs.length).toBe(logs1.length);
			for (let i = 0; i < logs.length; i++) {
				const log: Log = logs[i] as Log;
				const expectedSentLog = logs1.find((sentLog) => sentLog.id === log.id);
				expect(expectedSentLog).toBeDefined();
				const { userId, deletedId, executedAt, pushedAt, ...expectedLog }: Log =
					expectedSentLog as Log;
				let transformedExpectedLog = expectedLog;
				if (expectedLog.operationType === "delete") {
					const memberId = expectedSentLog?.deletedId?.split(".")[1];
					expect(memberId).toBeDefined();
					transformedExpectedLog = {
						...expectedLog,
						memberId: typeof memberId === "string" ? memberId : null,
					};
				}
				expect(log).toStrictEqual({
					...transformedExpectedLog,
					executedAt: executedAt.toISOString(),
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
