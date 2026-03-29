import { createId } from "@paralleldrive/cuid2";
import type { Log, Member } from "openselves-common/db";
import request from "supertest";

import { type TestEnv, setupTestSuite } from "./utils.js";

const pushEndpoint = "/sync/push";
const pullEndpoint = "/sync/pull";
describe(pushEndpoint, () => {
	let env: TestEnv;

	function makeMemberWithLog(date: Date) {
		const member: Omit<Member, "userId"> = {
			id: createId(),
			name: "Alice",
			pronouns: "she/her",
			description: "a member of our& system",
			isArchived: false,
			archivedReason: null,
			createdAt: date,
			updatedAt: date,
		};
		const createLog: Omit<Log, "pushedAt"> = {
			id: createId(),
			memberId: member.id,
			operationType: "create",
			data: member,
			executedAt: date,
		};
		return { member, createLog, date };
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
			const createLogWithPushedAt: Log = {
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

		describe("create operation", () => {
			describe("PUT create Member", () => {
				let outputLog: Record<string, unknown>;

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
					outputLog = response.body.logs[0];
					expect(typeof outputLog).toBe("object");
					expect(outputLog).toMatchObject({
						id: createLog.id,
						memberId: member.id,
						operationType: "create",
						data: {
							...member,
							createdAt: member.createdAt.toISOString(),
							updatedAt: member.updatedAt.toISOString(),
						},
						executedAt: date.toISOString(),
					});
					expect(outputLog.pushedAt).toBeDefined();
					expect(typeof outputLog.pushedAt).toBe("string");
					expect(typeof Date.parse(outputLog.pushedAt as string)).toBe("number");
					const pushedAt = new Date(outputLog.pushedAt as string);
					expect((Date.now() - pushedAt.getTime()) / 1000).toBeCloseTo(0, 0);
				});

				test(`Member is served via ${pullEndpoint}`, async () => {
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
						(log) =>
							log &&
							typeof log === "object" &&
							"id" in log &&
							log.id === outputLog.id,
					);
					expect(pulledLog).toBeDefined();
					expect(pulledLog).toEqual(outputLog);
				});
			});
		});

		// TODO: respond properly when push the same log twice (should not perform the operation, should respond with success and the transformed log)
		// TODO: create member with existing id fails
		// TODO: delete member that doesn't exist is successful but has no server effect
		// TODO: update member that was deleted returns a delete operation
		// TODO: logs.memberId != JSON.parse(logs.data).id => 400
		// TODO: multiple logs at once
	});
});
