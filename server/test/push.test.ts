import * as fs from "node:fs";
import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import test, { describe } from "node:test";
import type { FrontCreate, Log, Member, MemberCreate, User } from "openselves-common/db";

import {
	type ClientAttachment,
	type ClientLog,
	type ClientLogWithPushedAt,
	LARGE_IMAGE_FILE_PATH,
	TEST_IMAGE_DATA_URL,
	TEST_IMAGE_LONG_DATA_URL,
	attachFileToLog,
	getLogAttachmentUrl,
	makeMemberWithLog,
	putLog as originalPutLog,
	putLogs as originalPutLogs,
	pullEndpoint,
	pushEndpoint,
} from "./sync-utils.js";
import { type TestEnvWithUsers, setupTestSuiteWithUsers } from "./utils.js";

describe(pushEndpoint, () => {
	let env: TestEnvWithUsers;
	const putLog = (
		log: ClientLog,
		expectCode: number = 200,
		cookies: string = env.users.cookies,
	) => originalPutLog(env, log, expectCode, cookies);
	const putLogs = (
		logs: ClientLog[],
		expectCode: number = 200,
		cookies: string = env.users.cookies,
	) => originalPutLogs(env, logs, expectCode, cookies);

	function makeFrontWithLog(date: Date, memberCreateLog: ClientLog) {
		if (!memberCreateLog.memberId) {
			throw new Error("Missing memberId on memberCreateLog");
		}
		const front: Omit<FrontCreate, "userId" | "id"> = {
			memberId: memberCreateLog.memberId,
			note: "A note on this front",
			startedAt: new Date(),
			endedAt: new Date(Date.now() + 60 * 1000),
			createdAt: date,
			updatedAt: date,
		};
		const createLog: ClientLog & {
			frontId: string;
		} = {
			id: createId(),
			frontId: createId(),
			operationType: "create",
			data: front,
			executedAt: date,
		};
		return { front, createLog, memberCreateLog, date };
	}

	async function createMember(date?: Date, image?: string | ClientAttachment | null) {
		const { member, createLog } = makeMemberWithLog(date, image);
		const response = await putLog(createLog);
		assert.strictEqual(response.body.logs, undefined);
		await checkLogIsServed(createLog);
		return { member, createLog, response };
	}
	async function createAndDeleteMember() {
		const { member, createLog } = await createMember();

		const deleteLog: ClientLog & {
			memberId: string;
		} = {
			...createLog,
			id: createId(),
			operationType: "delete",
			data: null,
			executedAt: new Date(),
		};
		const response = await putLog(deleteLog);
		return { member, deleteLog, response };
	}

	async function createFrontEntry() {
		const { member, createLog: memberCreateLog } = await createMember();
		const { front, createLog } = makeFrontWithLog(new Date(), memberCreateLog);
		const response = await putLog(createLog);
		assert.strictEqual(response.body.logs, undefined);
		await checkLogIsServed(createLog);
		return { front, createLog, member, memberCreateLog, response };
	}

	async function getSyncFrom(timestamp: number | "init", cookies: string = env.users.cookies) {
		const response = await env.request
			.post(pullEndpoint)
			.send({
				timestamp: timestamp,
			})
			.set("Cookie", cookies)
			.expect(200)
			.expect("Content-Type", /json/);
		assert(Array.isArray(response.body.logs));
		assert(response.body.logs.length >= 1);
		return response;
	}

	function checkAndExtractLogAttachments(inputLog: ClientLog, user: User) {
		const outputLog = { ...inputLog };
		const attachments: ClientAttachment[] = [];
		if (outputLog.attachments) {
			if (!outputLog.data) {
				throw new Error("Log has attachments but not data", { cause: outputLog });
			}
			for (const [key, value] of Object.entries(outputLog.data)) {
				const attachment = outputLog.attachments.find(
					(attachment) => value === "attachment:" + attachment.name,
				);
				if (attachment) {
					attachments.push(attachment);
					outputLog.data[key] = getLogAttachmentUrl(
						env,
						user.id,
						outputLog,
						key,
					).absolute;
				}
			}
			if (outputLog.attachments?.length !== attachments.length) {
				throw new Error("Not all attachments were mapped", { cause: outputLog });
			}
			delete outputLog.attachments;
		}
		return {
			log: outputLog,
			attachments: attachments,
		};
	}

	async function checkLogIsServed(
		logToCheck: ClientLog,
		user: User = env.users.user,
		cookies: string = env.users.cookies,
	) {
		const { log: expectedClientLog, attachments } = checkAndExtractLogAttachments(
			logToCheck,
			user,
		);

		const logToCheckServer: Omit<Log, "userId" | "pushedAt" | "deletedId"> = {
			memberId: null,
			frontId: null,
			...expectedClientLog,
		};
		const response = await getSyncFrom(0, cookies);
		const pulledLogs = response.body.logs as Array<unknown>;
		const pulledLog = pulledLogs.find(
			(log) => log && typeof log === "object" && "id" in log && log.id === logToCheck.id,
		);
		assert.notStrictEqual(pulledLog, undefined);
		assert.deepStrictEqual(
			pulledLog,
			Object.fromEntries(
				Object.entries(logToCheckServer).map(([key, value]) => {
					if (value instanceof Date) {
						value = value.toISOString();
					} else if (value && typeof value === "object") {
						for (const key of Object.keys(value)) {
							if (value[key] instanceof Date) {
								value[key] = value[key].toISOString();
							}
						}
					}
					return [key, value];
				}),
			),
		);

		if (attachments.length > 0) {
			// Handling multiple attachments per log can be done once needed.
			assert.strictEqual(attachments.length, 1);

			const attachmentUrl = getLogAttachmentUrl(
				env,
				env.users.user.id,
				logToCheck,
				"image",
			).relative;
			await env.request.get(attachmentUrl).expect(401);
			await env.request.get(attachmentUrl).set("Cookie", env.users.cookies2).expect(404);
			const response = await env.request
				.get(attachmentUrl)
				.set("Cookie", env.users.cookies)
				.expect(200)
				.expect("Content-Type", "image/png");
			assert.deepStrictEqual(response.body, fs.readFileSync(attachments[0].path));

			await env.request
				.get(attachmentUrl)
				.set("Cookie", env.users.cookies)
				.set("If-None-Match", response.headers["etag"])
				.expect(304);
		}
	}

	async function checkLogIsNotServed(logToCheck: ClientLog, user: User = env.users.user) {
		const { attachments } = checkAndExtractLogAttachments(logToCheck, user);

		const response = await getSyncFrom(0);
		const pulledLogs = response.body.logs as Array<unknown>;
		const pulledLog = pulledLogs.find(
			(log) => log && typeof log === "object" && "id" in log && log.id === logToCheck.id,
		);
		assert.strictEqual(pulledLog, undefined);

		if (attachments.length > 0) {
			// Handling multiple attachments per log can be done once needed.
			assert.strictEqual(attachments.length, 1);

			const attachmentUrl = getLogAttachmentUrl(
				env,
				env.users.user.id,
				logToCheck,
				"image",
			).relative;
			await env.request.get(attachmentUrl).set("Cookie", env.users.cookies).expect(404);
		}
	}

	function testImage(
		testFn: (image: string | ClientAttachment | null | undefined) => Promise<ClientLog>,
	) {
		describe("image", () => {
			for (const { testName, image, expectCode, isServed } of [
				{
					testName: "valid http url 200",
					image: "http://example.com/image.png",
					expectCode: 200,
					isServed: true,
				},
				{
					testName: "data url (<8kB) 200",
					image: TEST_IMAGE_DATA_URL,
					expectCode: 200,
					isServed: true,
				},
				{
					testName: "undefined 200",
					image: undefined,
					expectCode: 200,
					isServed: true,
				},
				{
					testName: "null 200",
					image: null,
					expectCode: 200,
					isServed: true,
				},
				{
					testName: "file upload 200",
					image: {
						path: LARGE_IMAGE_FILE_PATH,
					},
					expectCode: 200,
					isServed: true,
				},
				{
					testName: "data url too long (>8kB) 400",
					image: TEST_IMAGE_LONG_DATA_URL,
					expectCode: 400,
					isServed: false,
				},
				{
					testName: "invalid data url 400",
					image: "data:notavaliddataurl",
					expectCode: 400,
					isServed: false,
				},
				{
					testName: "empty string 400",
					image: "",
					expectCode: 400,
					isServed: false,
				},
				{
					testName: "invalid url 400",
					image: "invalid url",
					expectCode: 400,
					isServed: false,
				},
			]) {
				test(testName, async () => {
					const log = await testFn(image);
					await putLog(log, expectCode, undefined);

					if (isServed) {
						await checkLogIsServed(log);
					} else {
						await checkLogIsNotServed(log);
					}
				});
			}
		});
	}

	async function testAttachmentIsDeleted(
		log: ClientLog,
		dataKey: string,
		callback: () => Promise<void>,
	) {
		const attachmentUrl = getLogAttachmentUrl(env, env.users.user.id, log, dataKey).relative;
		await env.request.get(attachmentUrl).set("Cookie", env.users.cookies).expect(200);
		await callback();
		await env.request.get(attachmentUrl).set("Cookie", env.users.cookies).expect(404);
	}

	setupTestSuiteWithUsers((testEnv) => {
		env = testEnv;
	});

	test("GET 404", async () => {
		await env.request.get(pushEndpoint).expect(404);
	});

	test("POST 404", async () => {
		await env.request.post(pushEndpoint).send({}).expect(404);
	});

	test("PATCH 404", async () => {
		await env.request.patch(pushEndpoint).send({}).expect(404);
	});

	test("DELETE 404", async () => {
		await env.request.delete(pushEndpoint).send({}).expect(404);
	});

	describe("PUT", () => {
		test("empty request body 400", async () => {
			await env.request
				.put(pushEndpoint)
				.set("Cookie", env.users.cookies)
				.send({})
				.expect(400);
		});
		test("empty logs array 400", async () => {
			await env.request
				.put(pushEndpoint)
				.set("Cookie", env.users.cookies)
				.send({ logs: [] })
				.expect(400);
		});
		test("log with non-null pushedAt 400", async () => {
			const { createLog, date } = makeMemberWithLog();
			const createLogWithPushedAt: ClientLogWithPushedAt = {
				...createLog,
				pushedAt: date,
			};
			await putLog(createLogWithPushedAt, 400);
		});
		test("log data with userId 400", async () => {
			const { createLog } = makeMemberWithLog();
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
				const { createLog } = makeMemberWithLog();

				await putLog(createLog);
				await checkLogIsServed(createLog);
			});

			test("minimal create data 200", async () => {
				const { createLog } = makeMemberWithLog(undefined, undefined, true);

				await putLog(createLog);
				await checkLogIsServed(createLog);
			});

			test("send create operation twice succeeds 200", async () => {
				const { createLog } = makeMemberWithLog();
				await putLog(createLog);
				await putLog(createLog);
			});

			test("create member with same id fails 409", async () => {
				const { createLog } = makeMemberWithLog();
				const { createLog: createLog2 } = makeMemberWithLog();
				createLog2.memberId = createLog.memberId;

				await putLog(createLog);

				await putLog(createLog2, 409);
			});

			testImage((image) => {
				const { createLog } = makeMemberWithLog(new Date(), image);
				return Promise.resolve(createLog);
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
				assert.strictEqual(response2.body.logs, undefined);

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
				assert.strictEqual(response2.body.logs, undefined);
			});

			test("Delete member with image deletes image from s3", async () => {
				const { createLog } = await createMember(undefined, {
					path: LARGE_IMAGE_FILE_PATH,
				});

				await testAttachmentIsDeleted(createLog, "image", async () => {
					const deleteLog = {
						id: createId(),
						memberId: createLog.memberId,
						operationType: "delete",
						data: null,
						executedAt: new Date(),
					} satisfies ClientLog;
					await putLog(deleteLog, 200);
				});
			});
		});

		describe("PUT update Member", () => {
			test("200", async () => {
				const { createLog } = makeMemberWithLog();

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

				const response = await getSyncFrom("init");
				assert(response.body.logs.length >= 1);
				const memberLog = (response.body.logs as Array<Log>).find(
					(log) => log.operationType === "create" && log.memberId === createLog.memberId,
				);
				assert.notStrictEqual(memberLog, undefined);
				assert.partialDeepStrictEqual(memberLog?.data, updateLog.data);
			});

			test("empty update data 400", async () => {
				const { createLog } = makeMemberWithLog();

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
				assert.strictEqual(response.body.logs, undefined);
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

				assert.strictEqual(response2.body.logs, undefined);

				// Check member was not deleted
				assert.notStrictEqual(createLog.data, undefined);
				const createName = (createLog.data as Record<string, unknown>)["name"];
				assert.notStrictEqual(createName, undefined);
				assert.notStrictEqual(createName, (updateLog.data as Record<string, unknown>).name);
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

			testImage(async (image) => {
				const { createLog } = await createMember();
				const updateLog: ClientLog & {
					data: {
						name: string;
						image?: string | null;
					};
				} = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "update",
					data: {
						name: "A new name",
						image: typeof image === "string" ? image : null,
					},
					executedAt: new Date(),
				} satisfies ClientLog;

				if (image === undefined) {
					delete updateLog.data.image;
				}

				if (image && typeof image !== "string") {
					attachFileToLog(image, updateLog, "image");
				}

				return updateLog;
			});
		});

		test("Set member with image image's to null deletes image from s3", async () => {
			const { createLog } = await createMember(undefined, {
				path: LARGE_IMAGE_FILE_PATH,
			});

			await testAttachmentIsDeleted(createLog, "image", async () => {
				const updateLog = {
					id: createId(),
					memberId: createLog.memberId,
					operationType: "update",
					data: {
						image: null,
					},
					executedAt: new Date(),
				} satisfies ClientLog;
				await putLog(updateLog, 200);
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
			const logs: (ClientLog & {
				memberId: string;
			})[] = [
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
			assert.strictEqual(dbRecords.length, 3);
			for (const record of dbRecords) {
				const member = members.find((member) => member.createLog.memberId === record.id);
				assert.notStrictEqual(member, undefined);

				let expectedData = Object.assign({}, member?.createLog.data);
				for (const log of logs) {
					if (log.memberId === member?.createLog.memberId) {
						expectedData = Object.assign(expectedData, log.data);
					}
				}
				assert.partialDeepStrictEqual(record, expectedData);
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
			const member = makeMemberWithLog();

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
			const member = makeMemberWithLog();

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

		async function setupLogMatrix() {
			const member = await createMember(new Date(0));
			const client1Logs: ClientLog[] = [
				{
					id: createId(),
					operationType: "update",
					memberId: member.createLog.memberId,
					data: {
						name: "1",
						pronouns: "1",
						description: "1",
						isArchived: true,
						archivedReason: "1",
					},
					executedAt: new Date(1),
				},
				{
					id: createId(),
					operationType: "update",
					memberId: member.createLog.memberId,
					data: {
						description: "3",
						archivedReason: "3",
					},
					executedAt: new Date(3),
				},
			];

			const client2Logs: ClientLog[] = [
				{
					id: createId(),
					operationType: "update",
					memberId: member.createLog.memberId,
					data: {
						pronouns: "2",
						description: "2",
						archivedReason: "2",
					},
					executedAt: new Date(2),
				},
				{
					id: createId(),
					operationType: "update",
					memberId: member.createLog.memberId,
					data: {
						archivedReason: "4",
					},
					executedAt: new Date(4),
				},
			];
			return { member, client1Logs, client2Logs };
		}

		async function verifyLogMatrixResult(member: {
			member: Omit<MemberCreate, "userId" | "id">;
			createLog: ClientLog;
		}) {
			const dbRecord = await env.db.query.members.findFirst({
				where: {
					userId: env.users.user.id,
					id: member.createLog.memberId,
				},
			});
			assert.notStrictEqual(dbRecord, undefined);
			assert.partialDeepStrictEqual(dbRecord, {
				name: "1",
				pronouns: "2",
				description: "3",
				isArchived: true,
				archivedReason: "4",
			});
		}

		test("PUT reconstruct data correctly when receiving out-of-order sync from previously offline client 200", async () => {
			{
				const { member, client1Logs, client2Logs } = await setupLogMatrix();

				await putLogs(client1Logs);
				await putLogs(client2Logs);

				await verifyLogMatrixResult(member);
			}
			{
				const { member, client1Logs, client2Logs } = await setupLogMatrix();

				await putLogs(client2Logs);
				await putLogs(client1Logs);

				await verifyLogMatrixResult(member);
			}
		});

		test("can handle date fields", async () => {
			const { createLog } = await createMember();

			await putLog({
				id: createId(),
				memberId: createLog.memberId,
				operationType: "update",
				data: {
					updatedAt: new Date(),
				},
				executedAt: new Date(),
			});
		});

		test("create front", async () => {
			await createFrontEntry();
		});

		test("update front", async () => {
			const { createLog } = await createFrontEntry();
			const updateLog: ClientLog = {
				id: createId(),
				frontId: createLog.frontId,
				operationType: "update",
				data: {
					note: "hi",
					endedAt: new Date(),
				},
				executedAt: new Date(),
			};
			await putLog(updateLog);
			await checkLogIsServed(updateLog);
		});

		test("delete front", async () => {
			const { createLog } = await createFrontEntry();
			const deleteLog: ClientLog = {
				id: createId(),
				frontId: createLog.frontId,
				operationType: "delete",
				data: null,
				executedAt: new Date(),
			};
			await putLog(deleteLog);
			await checkLogIsServed(deleteLog);
		});

		test("create member and front in same request", async () => {
			const date = new Date();
			const { createLog: memberCreateLog } = makeMemberWithLog(date);
			const { createLog: frontCreateLog } = makeFrontWithLog(date, memberCreateLog);
			await putLogs([memberCreateLog, frontCreateLog]);
			await checkLogIsServed(memberCreateLog);
			await checkLogIsServed(frontCreateLog);
		});

		test("do operations on both members and fronts in a single request", async () => {
			const date = new Date();
			const { createLog: frontCreateLog, memberCreateLog } = await createFrontEntry();
			const { createLog: frontCreateLogToDelete, memberCreateLog: memberCreateLogToDelete } =
				await createFrontEntry();
			const { createLog: member2CreateLog } = makeMemberWithLog(date);
			const { createLog: front2CreateLog } = makeFrontWithLog(date, memberCreateLog);
			const logs: ClientLog[] = [
				member2CreateLog,
				front2CreateLog,
				{
					id: createId(),
					memberId: memberCreateLog.memberId,
					operationType: "update",
					data: {
						description: "a new description",
						updatedAt: new Date(),
					},
					executedAt: new Date(),
				},
				{
					id: createId(),
					frontId: frontCreateLog.frontId,
					operationType: "update",
					data: {
						memberId: member2CreateLog.memberId,
						note: "oopsie",
						updatedAt: new Date(),
					},
					executedAt: new Date(),
				},
				{
					id: createId(),
					memberId: member2CreateLog.memberId,
					operationType: "update",
					data: {
						description: "another new description",
						updatedAt: new Date(),
					},
					executedAt: new Date(),
				},
				{
					id: createId(),
					frontId: frontCreateLogToDelete.frontId,
					operationType: "delete",
					data: null,
					executedAt: new Date(),
				},
				{
					id: createId(),
					memberId: memberCreateLogToDelete.memberId,
					operationType: "delete",
					data: null,
					executedAt: new Date(),
				},
			];
			await putLogs(logs);

			await getSyncFrom("init");
			for (const log of logs.slice(0, -2)) {
				await checkLogIsServed(log);
			}
		});
	});
});
