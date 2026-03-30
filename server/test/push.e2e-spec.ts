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
					(log) =>
						log && typeof log === "object" && "id" in log && log.id === logToCheck.id,
				);
				expect(pulledLog).toBeDefined();
				expect(pulledLog).toEqual(logToCheck);
			}

			describe("PUT create Member", () => {
				let inputLog: Record<string, unknown>;
				let outputLog: Record<string, unknown>;

				test("200", async () => {
					const { member, createLog, date } = makeMemberWithLog(new Date());
					inputLog = { ...createLog };

					const response = await request(env.server)
						.put(pushEndpoint)
						.send({
							logs: [inputLog],
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

					checkForPushedAt(outputLog);
					await checkLogIsServed(outputLog);
				});

				test("send create operation twice returns existing log 200", async () => {
					const response = await request(env.server)
						.put(pushEndpoint)
						.send({
							logs: [inputLog],
						})
						.set("Cookie", env.users.cookies)
						.expect(200)
						.expect("Content-Type", /json/);
					const returnedLogs = response.body.logs as Array<unknown>;
					const returnedLog = returnedLogs.find(
						(log) =>
							log &&
							typeof log === "object" &&
							"id" in log &&
							log.id === outputLog.id,
					);
					expect(returnedLog).toEqual(outputLog);
				});

				test("create member with same id fails 409", async () => {
					const { createLog } = makeMemberWithLog(new Date());
					const { createLog: createLog2 } = makeMemberWithLog(new Date());
					createLog2.memberId = createLog.memberId;
					const member = createLog2.data as Member;
					member.id = createLog.data?.["id"];

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
				let inputLog: Record<string, unknown>;
				let outputLog: Record<string, unknown>;

				test("200", async () => {
					const { member, createLog } = makeMemberWithLog(new Date());
					inputLog = { ...createLog };

					await request(env.server)
						.put(pushEndpoint)
						.send({
							logs: [inputLog],
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
					expect(response.body.logs).toBeInstanceOf(Array);
					expect(response.body.logs.length).toBe(1);
					outputLog = response.body.logs[0];
					expect(typeof outputLog).toBe("object");
					expect(outputLog).toMatchObject({
						id: deleteLog.id,
						memberId: member.id,
						operationType: "delete",
						executedAt: deleteLog.executedAt.toISOString(),
					});

					checkForPushedAt(outputLog);
					await checkLogIsServed(outputLog);
				});
			});
		});

		// TODO: delete member that doesn't exist is successful but has no server effect
		// TODO: update member that was deleted returns a delete operation
		// TODO: logs.memberId != JSON.parse(logs.data).id => 400
		// TODO: multiple logs at once
	});
});
