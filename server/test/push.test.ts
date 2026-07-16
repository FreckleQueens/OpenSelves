import { type GetObjectCommandOutput, NoSuchKey } from "@aws-sdk/client-s3";
import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import test, { describe } from "node:test";
import { shuffleArray } from "openselves-common";
import { type AnyEntryDataModel, Front, Member } from "openselves-common/client";
import {
	type Entry,
	type EntryWithPayload,
	EntryWrapper,
	MAX_IN_DB_PAYLOAD_LENGTH,
	MAX_PATH_LENGTH,
	MAX_UINT64,
	OPENSELVES_NAMESPACE_ID,
	hashPayload,
	isEntryWithPayload,
	isJsonFriendlyEntryWithPayload,
	j2000Now,
} from "openselves-common/willow";

import { S3Service } from "../src/sync/s3.service.js";
import {
	type FileRef,
	LARGE_IMAGE_FILE_PATH,
	TEST_IMAGE_DATA_URL,
	TEST_IMAGE_LONG_DATA_URL,
	makeMember,
	putEntries as originalPutEntries,
	putEntry as originalPutEntry,
	pullEndpoint,
	pushEndpoint,
	readFile,
} from "./sync-utils.js";
import { type TestEnvWithUsers, setupTestSuiteWithUsers } from "./utils.js";

async function timeModelEntries(model: AnyEntryDataModel, timestamp: bigint): Promise<Entry[]> {
	return (await model.flushDirtyEntries()).map(
		(entry): Entry => ({
			...entry.entryMaybeWithPayload,
			timestamp,
		}),
	);
}

describe(pushEndpoint, () => {
	let env: TestEnvWithUsers;
	const putEntry = (
		entry: Entry | EntryWrapper | Record<string, unknown>,
		expectCode: number = 200,
		cookies: string = env.users.user1.cookies,
		processEntryObjects: boolean = true,
	) => originalPutEntry(env, entry, expectCode, cookies, processEntryObjects);
	const putEntries = (
		entries: (Entry | EntryWrapper | Record<string, unknown>)[],
		expectCode: number = 200,
		cookies: string = env.users.user1.cookies,
		processEntryObjects: boolean = true,
	) => originalPutEntries(env, entries, expectCode, cookies, processEntryObjects);

	function makeFront(member: Member, date: Date) {
		const front = new Front(member.subspaceId, {
			memberId: member.get("id"),
			note: "A note on this front",
			startedAt: new Date(),
			endedAt: new Date(Date.now() + 60 * 1000),
			createdAt: date,
		});
		return { front, date };
	}

	async function createMember(userId: string, date?: Date, image?: string | FileRef | null) {
		const { member } = makeMember(userId, date, image);
		const entries = await member.flushDirtyEntries();
		const response = await putEntries(entries);
		assert.strictEqual(response.body["entries"], undefined);
		await checkEntriesAreServed(entries);
		return { member, entries, response };
	}
	async function createAndDeleteMember(userId: string = env.users.user1.api.id) {
		const { member, entries } = await createMember(userId);
		const deleteEntry = await member.makePermanentDeleteEntry();
		const response = await putEntry(deleteEntry);
		return { member, createEntries: entries, deleteEntry, response };
	}

	async function createFront(userId: string) {
		const { member, entries: memberEntries } = await createMember(userId);
		const { front } = makeFront(member, new Date());
		const entries = await front.flushDirtyEntries();
		const response = await putEntries(entries);
		assert.strictEqual(response.body["entries"], undefined);
		await checkEntriesAreServed(entries);
		return { front, entries, member, memberEntries, response };
	}

	async function getSyncFrom(timestamp: string, cookies: string = env.users.user1.cookies) {
		const response = await env.request
			.post(pullEndpoint)
			.send({
				timestamp: timestamp,
			})
			.set("Cookie", cookies)
			.expect(200)
			.json();
		assert(Array.isArray(response.body["entries"]));
		return response;
	}

	async function checkEntriesAreServed(
		entries: (EntryWrapper | Entry | EntryWithPayload)[],
		cookies: string = env.users.user1.cookies,
	) {
		assert(entries.length > 0);

		const response = await getSyncFrom("", cookies);
		const responseEntries = response.body["entries"];
		assert(Array.isArray(responseEntries));
		assert(responseEntries.length > 0);

		const actualEntries = (
			await Promise.all(responseEntries.map((entry: unknown) => EntryWrapper.load(entry)))
		).map((entry) => entry.entryMaybeWithPayload);

		const expectedEntries = entries.map((entry) =>
			entry instanceof EntryWrapper ? entry.entryMaybeWithPayload : entry,
		);
		for (const expectedEntry of expectedEntries) {
			const actualEntry = actualEntries.find((entry) => entry.path === expectedEntry.path);
			assert(actualEntry);
			assert.deepStrictEqual(actualEntry, expectedEntry);
		}
	}

	async function checkEntriesAreNotServed(entries: (EntryWrapper | Entry | EntryWithPayload)[]) {
		const response = await getSyncFrom("");
		const responseEntries = response.body["entries"];
		assert(Array.isArray(responseEntries));
		const actualEntries = await Promise.all(
			responseEntries.map((entry: unknown) => EntryWrapper.load(entry)),
		);

		for (const expectedEntry of entries) {
			for (const actualEntry of actualEntries) {
				assert.notDeepStrictEqual(
					actualEntry?.entryMaybeWithPayload,
					expectedEntry instanceof EntryWrapper
						? expectedEntry.entryMaybeWithPayload
						: expectedEntry,
				);
			}
		}
	}

	function testImage(
		testFn: (image: string | FileRef | null | undefined) => Promise<EntryWrapper>,
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
					testName: "long data url (>8kB) 200",
					image: TEST_IMAGE_LONG_DATA_URL,
					expectCode: 200,
					isServed: true,
				},
				{
					testName: "raw file upload 200",
					image: {
						filePath: LARGE_IMAGE_FILE_PATH,
					},
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
			]) {
				test(testName, async () => {
					const entry = await testFn(image);
					await putEntry(entry, expectCode, undefined);

					if (isServed) {
						await checkEntriesAreServed([entry]);
					} else {
						await checkEntriesAreNotServed([entry]);
					}
				});
			}
		});
	}

	async function testPayloadIsDeletedFromS3(entry: Entry, callback: () => Promise<void>) {
		const s3Service = env.app.get(S3Service);

		let getObjectResult: GetObjectCommandOutput | undefined = await s3Service.getObject(
			entry.payloadDigest,
		);
		assert(getObjectResult);

		await callback();

		getObjectResult = undefined;
		let error: unknown;
		try {
			getObjectResult = await s3Service.getObject(entry.payloadDigest);
		} catch (e) {
			error = e;
		}
		assert(!getObjectResult);
		assert(error);
		assert(error instanceof NoSuchKey);
	}

	setupTestSuiteWithUsers(
		(testEnv) => {
			env = testEnv;
		},
		true,
		true,
	);

	test("GET 404", async () => {
		await env.request.get(pushEndpoint).expect(404).execute();
	});

	test("POST 404", async () => {
		await env.request.post(pushEndpoint).send({}).expect(404).execute();
	});

	test("PATCH 404", async () => {
		await env.request.patch(pushEndpoint).send({}).expect(404).execute();
	});

	test("DELETE 404", async () => {
		await env.request.delete(pushEndpoint).send({}).expect(404).execute();
	});

	describe("PUT", () => {
		test("empty request body 400", async () => {
			await env.request
				.put(pushEndpoint)
				.authenticated(env.users.user1)
				.send({})
				.expect(400)
				.execute();
		});
		test("empty entries array 400", async () => {
			await env.request
				.put(pushEndpoint)
				.authenticated(env.users.user1)
				.send({ entries: [] })
				.expect(400)
				.execute();
		});

		describe("forged and invalid entries", () => {
			type TestCase = {
				name: string;
				forgeEntry: (
					entry: Partial<EntryWithPayload> & Record<string, unknown>,
				) => Promise<void> | void;
				expectCode?: number;
			};
			const testCases: TestCase[] = [
				{
					name: "control 200",
					forgeEntry: () => {},
					expectCode: 200,
				},

				// namespaceId
				{
					name: "empty namespaceId 400",
					forgeEntry: (entry) => {
						entry.namespaceId = "";
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "wrong namespaceId 400",
					forgeEntry: (entry) => {
						entry.namespaceId = "not the correct namespaceId";
						assert(isEntryWithPayload(entry));
					},
				},

				// subspaceId
				{
					name: "correct subspaceId 200",
					forgeEntry: (entry) => {
						entry.subspaceId = env.users.user1.api.id;
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "empty subspaceId 403",
					forgeEntry: (entry) => {
						entry.subspaceId = "";
						assert(isEntryWithPayload(entry));
					},
					expectCode: 403,
				},
				{
					name: "wrong subspaceId 403",
					forgeEntry: (entry) => {
						entry.subspaceId = "not the correct subspaceId";
						assert(isEntryWithPayload(entry));
					},
					expectCode: 403,
				},
				{
					name: "other user's subspaceId 403",
					forgeEntry: (entry) => {
						entry.subspaceId = env.users.user2.api.id;
						assert(isEntryWithPayload(entry));
					},
					expectCode: 403,
				},

				// path
				{
					name: "empty path 400",
					forgeEntry: (entry) => {
						entry.path = "";
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "/ path 400",
					forgeEntry: (entry) => {
						entry.path = "/";
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "single component path 200",
					forgeEntry: (entry) => {
						entry.path = "/hi";
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "missing starting / path 400",
					forgeEntry: (entry) => {
						entry.path = "hi";
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "trailing / path 400",
					forgeEntry: (entry) => {
						entry.path = "/hi/";
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "empty component path 400",
					forgeEntry: (entry) => {
						entry.path = "/a//b/c";
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "too long path 400",
					forgeEntry: (entry) => {
						entry.path = "/" + "a".repeat(MAX_PATH_LENGTH);
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "just long enough path 200",
					forgeEntry: (entry) => {
						entry.path = "/" + "a".repeat(MAX_PATH_LENGTH - 1);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},

				// timestamp
				{
					name: "now timestamp 200",
					forgeEntry: (entry) => {
						entry.timestamp = j2000Now();
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "0 timestamp 200",
					forgeEntry: (entry) => {
						entry.timestamp = 0n;
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "negative timestamp 400",
					forgeEntry: (entry) => {
						entry.timestamp = -1n;
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "timestamp 15min in the future 400",
					forgeEntry: (entry) => {
						entry.timestamp = j2000Now() + 15n * 60n * 1000_000n;
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "timestamp 5min in the future 200",
					forgeEntry: (entry) => {
						entry.timestamp = j2000Now() + 5n * 60n * 1000_000n;
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "timestamp max uint64 with non-empty payload 400",
					forgeEntry: (entry) => {
						entry.timestamp = MAX_UINT64;
						assert(isEntryWithPayload(entry));
					},
				},
				{
					name: "timestamp max uint64 with empty payload 200",
					forgeEntry: async (entry) => {
						entry.timestamp = MAX_UINT64;
						entry.payload = "";
						entry.payloadLength = 0n;
						entry.payloadDigest = await hashPayload(entry.payload);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},

				// payloadLength
				{
					name: "wrong payloadLength 400",
					forgeEntry: (entry) => {
						const forgedLength = 999999999n;
						assert(entry.payload);
						assert.notStrictEqual(Number(forgedLength), entry.payload.length);
						entry.payloadLength = forgedLength;
						assert(isEntryWithPayload(entry));
					},
				},

				// payloadDigest
				{
					name: "wrong payloadDigest 400",
					forgeEntry: async (entry) => {
						const forgedPayload = crypto
							.getRandomValues(Buffer.alloc(32))
							.toString("hex");
						assert.notStrictEqual(forgedPayload, entry.payload);

						const forgedDigest = await hashPayload(forgedPayload);
						assert.notStrictEqual(forgedDigest, entry.payloadDigest);

						entry.payloadDigest = forgedDigest;
						assert(isEntryWithPayload(entry));
					},
				},

				// payload
				{
					name: "empty payload 200",
					forgeEntry: async (entry) => {
						entry.payload = "";
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await hashPayload(entry.payload);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "empty payload with wrong payloadLength 400",
					forgeEntry: async (entry) => {
						entry.payload = "";
						entry.payloadDigest = await hashPayload(entry.payload);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 400,
				},
				{
					name: "empty payload with wrong payloadDigest 400",
					forgeEntry: (entry) => {
						entry.payload = "";
						entry.payloadLength = BigInt(entry.payload.length);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 400,
				},
				{
					name: "small payload (<=8192) 200",
					forgeEntry: async (entry) => {
						entry.payload = "a".repeat(MAX_IN_DB_PAYLOAD_LENGTH);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await hashPayload(entry.payload);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "large payload (>8192) 200",
					forgeEntry: async (entry) => {
						entry.payload = "a".repeat(MAX_IN_DB_PAYLOAD_LENGTH + 1);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await hashPayload(entry.payload);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "payload length at limit 200",
					forgeEntry: async (entry) => {
						entry.payload = "a".repeat(
							env.configService.getOrThrow("MAX_UPLOAD_SIZE", {
								infer: true,
							}),
						);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await hashPayload(entry.payload);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
				{
					name: "payload length over limit 413",
					forgeEntry: async (entry) => {
						entry.payload = "a".repeat(
							env.configService.getOrThrow("MAX_UPLOAD_SIZE", {
								infer: true,
							}) + 1,
						);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await hashPayload(entry.payload);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 413,
				},
				{
					name: "payload with null byte 200",
					forgeEntry: async (entry) => {
						entry.payload = "\x00";
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await hashPayload(entry.payload);
						assert(isEntryWithPayload(entry));
					},
					expectCode: 200,
				},
			];

			testCases.push(
				...[
					"namespaceId",
					"subspaceId",
					"path",
					"timestamp",
					"payloadLength",
					"payloadDigest",
					"payload",
				].map(
					(field): TestCase => ({
						name: "missing " + field + " 400",
						forgeEntry: (entry) => {
							assert(isEntryWithPayload(entry));
							delete entry[field];
							assert(!isEntryWithPayload(entry));
						},
					}),
				),
			);

			for (const testCase of testCases) {
				test(testCase.name, async () => {
					const { member } = makeMember(env.users.user1.api.id);
					const entry = (await member.flushDirtyEntries())[0].entryMaybeWithPayload;
					assert(isEntryWithPayload(entry));

					await testCase.forgeEntry(entry as EntryWithPayload & Record<string, unknown>);

					const processedEntry = { ...entry };
					for (const [key, value] of Object.entries(processedEntry)) {
						if (typeof value === "bigint") {
							processedEntry[key] = value.toString();
						}
					}

					await putEntry(
						processedEntry,
						typeof testCase.expectCode === "number" ? testCase.expectCode : 400,
						undefined,
						false,
					);

					if (testCase.expectCode === 200) {
						await checkEntriesAreServed([entry]);
					} else {
						await checkEntriesAreNotServed([entry]);
					}
				});
			}
		});

		test("Putting an entry twice only has an effect the first time", async () => {
			const { member } = makeMember(env.users.user1.api.id);
			const entries = await member.flushDirtyEntries();
			const unrelatedEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.api.id,
				"/test/" + createId(),
				j2000Now(),
				"hi",
			);

			await putEntries([...entries, unrelatedEntry]);
			await checkEntriesAreServed([...entries, unrelatedEntry]);

			const memberDeleteEntry = await member.makePermanentDeleteEntry();
			await putEntry(memberDeleteEntry);
			await checkEntriesAreServed([memberDeleteEntry, unrelatedEntry]);
			await checkEntriesAreNotServed(entries);

			await putEntry(memberDeleteEntry);
			await checkEntriesAreServed([memberDeleteEntry, unrelatedEntry]);
			await checkEntriesAreNotServed(entries);
		});

		test("Putting an entry that is superseded by another entry of the same path has no effect", async () => {
			const root = createId();
			const entry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.api.id,
				"/test/" + root + "/a",
				1n,
				"hi",
			);
			const supersedingEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.api.id,
				"/test/" + root + "/a",
				2n,
				"bye",
			);

			await putEntry(supersedingEntry);
			await checkEntriesAreServed([supersedingEntry]);

			await putEntry(entry);
			await checkEntriesAreNotServed([entry]);
			await checkEntriesAreServed([supersedingEntry]);
		});

		test("Putting an entry that is superseded by another entry of a prefixing path has no effect", async () => {
			const root = createId();
			const entry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.api.id,
				"/test/" + root + "/child",
				1n,
				"hi",
			);
			const supersedingEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.api.id,
				"/test/" + root,
				2n,
				"bye",
			);

			await putEntry(supersedingEntry);
			await checkEntriesAreServed([supersedingEntry]);

			await putEntry(entry);
			await checkEntriesAreNotServed([entry]);
			await checkEntriesAreServed([supersedingEntry]);
		});

		test("Putting an entry older than another entry it prefixes after the latter keeps both entries", async () => {
			const root = createId();
			const parentEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.api.id,
				"/test/" + root,
				1n,
				"hi",
			);
			const childEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.api.id,
				"/test/" + root + "/child",
				2n,
				"bye",
			);

			await putEntry(childEntry);
			await checkEntriesAreServed([childEntry]);

			await putEntry(parentEntry);
			await checkEntriesAreServed([parentEntry, childEntry]);
		});

		describe("PUT create Member", () => {
			test("200", async () => {
				const { member } = makeMember(env.users.user1.api.id);

				const entries = await member.flushDirtyEntries();
				await putEntries(entries);
				await checkEntriesAreServed(entries);
			});

			test("minimal create data 200", async () => {
				const { member } = makeMember(env.users.user1.api.id, undefined, undefined, true);

				const entries = await member.flushDirtyEntries();
				await putEntries(entries);
				await checkEntriesAreServed(entries);
			});

			testImage(async (image) => {
				const { member } = makeMember(env.users.user1.api.id);

				if (image && typeof image !== "string") {
					member.set("image", readFile(image.filePath));
				} else {
					member.set("image", image === null ? undefined : image);
				}

				const entry = (await member.flushDirtyEntries()).find((entry) =>
					entry.path.endsWith("/image"),
				);
				assert(entry);
				return entry;
			});
		});

		describe("PUT delete Member", () => {
			test("200", async () => {
				const { createEntries, deleteEntry } = await createAndDeleteMember();
				await checkEntriesAreServed([deleteEntry]);
				await checkEntriesAreNotServed(createEntries);
			});

			test("delete member twice succeeds 200", async () => {
				const { member } = await createAndDeleteMember();

				await putEntry(await member.makePermanentDeleteEntry());
			});

			test("delete member of another user fails 404", async () => {
				const { member, entries } = await createMember(env.users.user1.api.id);

				const deleteEntry = await member.makeDeleteEntry();
				const response = await putEntry(deleteEntry, 403, env.users.user2.cookies);
				assert.strictEqual(response.body["entries"], undefined);

				// Check member was not deleted
				await checkEntriesAreServed(entries);
			});

			test("Delete member with image deletes image from s3", async () => {
				const { member, entries } = await createMember(
					env.users.user1.api.id,
					undefined,
					readFile(LARGE_IMAGE_FILE_PATH) +
						crypto.getRandomValues(Buffer.alloc(32)).toString(),
				);

				const imageEntry = entries.find((entry) => entry.path.endsWith("/image"));
				assert(imageEntry);

				await testPayloadIsDeletedFromS3(imageEntry, async () => {
					await putEntry(await member.makeDeleteEntry(), 200);
				});
			});

			test("Delete member's image deletes image from s3", async () => {
				const { entries } = await createMember(
					env.users.user1.api.id,
					undefined,
					readFile(LARGE_IMAGE_FILE_PATH) +
						crypto.getRandomValues(Buffer.alloc(32)).toString(),
				);

				const imageEntry = entries.find((entry) => entry.path.endsWith("/image"));
				assert(imageEntry);

				await testPayloadIsDeletedFromS3(imageEntry, async () => {
					const deleteEntry = await EntryWrapper.load(imageEntry);
					await deleteEntry.setPayload("");
					await putEntry(deleteEntry, 200);
				});
			});
		});

		describe("PUT update Member", () => {
			test("200", async () => {
				const { member } = await createMember(env.users.user1.api.id);

				member.assign({
					pronouns: "she/they",
					description: "a member of our& system who went through some changes",
					isArchived: true,
					archivedReason: "a reason for archival",
				});
				const updateEntries = await member.flushDirtyEntries();
				await putEntries(updateEntries);

				await checkEntriesAreServed(updateEntries);
			});

			test("update member of another user fails 403", async () => {
				const { member, entries } = await createMember(env.users.user1.api.id);
				const expectedEntries = entries.map((entry) => entry.entryMaybeWithPayload);

				member.set("name", "a new name");
				const updateEntries = await member.flushDirtyEntries();
				const response2 = await putEntries(updateEntries, 403, env.users.user2.cookies);

				assert.strictEqual(response2.body["entries"], undefined);
				await checkEntriesAreServed(expectedEntries);
				await checkEntriesAreNotServed(updateEntries);
			});

			test("update member that was already deleted succeeds 200", async () => {
				const { member } = await createAndDeleteMember();
				member.set("name", "a new name");

				const entries = await member.flushDirtyEntries();
				await putEntries(entries);
				await checkEntriesAreNotServed(entries);
			});

			testImage(async (image) => {
				const { member } = await createMember(env.users.user1.api.id);

				if (image && typeof image !== "string") {
					member.set("image", readFile(image.filePath));
				} else {
					member.set("image", image === null ? undefined : image);
				}

				return (await member.flushDirtyEntries())[0];
			});
		});

		test("Set member with image image's to undefined deletes image from s3", async () => {
			const randomValues = crypto.getRandomValues(Buffer.alloc(5000));
			const bigData = randomValues.toString("hex");
			assert(bigData.length > MAX_IN_DB_PAYLOAD_LENGTH);
			const { member, entries } = await createMember(env.users.user1.api.id, undefined, bigData);

			const originalImageEntry = entries.find((entry) =>
				entry.path.endsWith("/image"),
			)?.entryMaybeWithPayload;
			assert(originalImageEntry);

			member.set("image", undefined);

			const deleteImageEntry = (await member.flushDirtyEntries())[0];

			await testPayloadIsDeletedFromS3(originalImageEntry, async () => {
				await putEntry(deleteImageEntry, 200);
			});
		});

		async function testPuttingALotOfEntries(
			callback: ({
				cookies,
				entries,
			}: {
				cookies: string;
				entries: Entry[];
			}) => Promise<void>,
		) {
			const user = env.users.user1.api;
			const cookies = env.users.user1.cookies;
			const { member: memberToDelete } = makeMember(user.id);

			await putEntries(await timeModelEntries(memberToDelete, 0n), undefined, cookies);

			const members = [makeMember(user.id), makeMember(user.id), makeMember(user.id)];

			const entries: Entry[] = [
				...(await timeModelEntries(members[0].member, 1n)),
				...(await timeModelEntries(members[1].member, 2n)),
				await EntryWrapper.create(
					OPENSELVES_NAMESPACE_ID,
					user.id,
					members[1].member.getPathRoot() + "/description",
					3n,
					"a new description",
				),
				...(await timeModelEntries(members[2].member, 4n)),
				await EntryWrapper.create(
					OPENSELVES_NAMESPACE_ID,
					user.id,
					members[0].member.getPathRoot() + "/pronouns",
					5n,
					"iel/ellui",
				),
				await memberToDelete.makeDeleteEntry(6n),
			];
			members[2].member.assign({
				pronouns: "they/them",
				isArchived: true,
				archivedReason: "a reason",
			});
			entries.push(...(await timeModelEntries(members[2].member, 7n)));

			await callback({ cookies, entries });

			const response = await getSyncFrom("", cookies);
			const responseEntries = response.body["entries"];
			assert(responseEntries);
			assert(Array.isArray(responseEntries));
			// 3 members times 8 fields plus one deleted member
			assert.strictEqual(responseEntries.length, 3 * 8 + 1);
		}

		test("PUT create, update and delete members all at once 200", async () => {
			await testPuttingALotOfEntries(async ({ cookies, entries }) => {
				await putEntries(entries, undefined, cookies);
			});
		});

		test("PUT create, update and delete members one by one in random order 200", async () => {
			await testPuttingALotOfEntries(async ({ cookies, entries }) => {
				const shuffledEntries = shuffleArray(entries);
				for (const entry of shuffledEntries) {
					await putEntry(entry, undefined, cookies);
				}
			});
		});

		async function setupEntryMatrix() {
			const member = makeMember(env.users.user1.api.id);
			await putEntries(await timeModelEntries(member.member, 0n));

			const client1Entries: Entry[] = [];
			member.member.assign({
				name: "1",
				pronouns: "1",
				description: "1",
				isArchived: true,
				archivedReason: "1",
			});
			client1Entries.push(...(await timeModelEntries(member.member, 1n)));
			member.member.assign({
				description: "3",
				archivedReason: "3",
			});
			client1Entries.push(...(await timeModelEntries(member.member, 3n)));

			const client2Entries: Entry[] = [];
			member.member.assign({
				pronouns: "2",
				description: "2",
				archivedReason: "2",
			});
			client2Entries.push(...(await timeModelEntries(member.member, 2n)));
			member.member.assign({
				archivedReason: "4",
			});
			client2Entries.push(...(await timeModelEntries(member.member, 4n)));

			return { member, client1Entries, client2Entries };
		}

		async function verifyEntryMatrixResult(member: Member) {
			const response = await getSyncFrom("");
			const responseEntries = response.body["entries"];
			assert(responseEntries);
			assert(Array.isArray(responseEntries));
			assert(responseEntries.every((entry) => isJsonFriendlyEntryWithPayload(entry)));

			const reconstructedMember = new Member(
				member.subspaceId,
				await Promise.all(
					responseEntries
						.filter((entry) => entry.path.startsWith(member.getPathRoot()))
						.map((entry) => EntryWrapper.load(entry, entry.payload)),
				),
			);

			assert.partialDeepStrictEqual(reconstructedMember.data, {
				name: "1",
				pronouns: "2",
				description: "3",
				isArchived: true,
				archivedReason: "4",
			});
		}

		test("PUT reconstruct data correctly when receiving out-of-order sync from previously offline client 200", async () => {
			{
				const { member, client1Entries, client2Entries } = await setupEntryMatrix();

				await putEntries(client1Entries);
				await putEntries(client2Entries);

				await verifyEntryMatrixResult(member.member);
			}
			{
				const { member, client1Entries, client2Entries } = await setupEntryMatrix();

				await putEntries(client2Entries);
				await putEntries(client1Entries);

				await verifyEntryMatrixResult(member.member);
			}
		});

		test("create front", async () => {
			await createFront(env.users.user1.api.id);
		});

		test("update front", async () => {
			const { front } = await createFront(env.users.user1.api.id);
			front.assign({
				note: "hi",
				endedAt: new Date(),
			});
			const entries = await front.flushDirtyEntries();
			await putEntries(entries);
			await checkEntriesAreServed(entries);
		});

		test("delete front", async () => {
			const { front, entries } = await createFront(env.users.user1.api.id);
			const deleteEntry = await front.makeDeleteEntry();
			await putEntry(deleteEntry);
			await checkEntriesAreServed([deleteEntry]);
			await checkEntriesAreNotServed(entries);
		});
	});
});
