import { type GetObjectCommandOutput, NoSuchKey } from "@aws-sdk/client-s3";
import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import test, { describe } from "node:test";
import { shuffleArray } from "openselves-common";
import { type AnyEntryDataModel, Front, Member } from "openselves-common/client";
import {
	ByteString,
	Entry,
	EntryWithPayload,
	EntryWrapper,
	MAX_IN_DB_PAYLOAD_LENGTH,
	OPENSELVES_NAMESPACE_ID,
	Path,
	PayloadDigest,
	type SubspaceId,
	Timestamp,
	UInt64,
	Willow25,
} from "openselves-common/willow";

import { S3Service } from "../src/sync/s3.service.js";
import type { UserAuthData } from "./TestQueryBuilder.js";
import {
	type FileRef,
	LARGE_IMAGE_FILE_PATH,
	TEST_IMAGE_DATA_URL,
	TEST_IMAGE_LONG_DATA_URL,
	makeMember,
	getSyncFrom as originalGetSyncFrom,
	putEntries as originalPutEntries,
	putEntry as originalPutEntry,
	pushEndpoint,
	readFile,
} from "./sync-utils.js";
import { type TestEnvWithUsers, setupTestSuiteWithUsers } from "./utils.js";

async function timeModelEntries(
	model: AnyEntryDataModel,
	timestamp: Timestamp,
): Promise<EntryWithPayload[]> {
	return (await model.flushDirtyEntries()).map((entry) => ({
		...entry.entryWithPayload,
		timestamp,
	}));
}

// TODO: test request timeout (no data in 60s? force close)

describe(pushEndpoint, () => {
	let env: TestEnvWithUsers;
	const putEntry = (
		entry: EntryWithPayload,
		expectCode: number = 200,
		user: UserAuthData = env.users.user1,
	) => originalPutEntry(env, entry, expectCode, user);
	const putEntries = (
		entries: EntryWithPayload[],
		expectCode: number = 200,
		user: UserAuthData = env.users.user1,
	) => originalPutEntries(env, entries, expectCode, user);

	const getSyncFrom = (
		timestamp: string,
		subspaceId: ByteString = env.users.user1.keys.publicKey,
		user: UserAuthData = env.users.user1,
	) => originalGetSyncFrom(env, timestamp, subspaceId, user);

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

	async function createMember(
		subspaceId: SubspaceId,
		date?: Date,
		image?: string | FileRef | null,
	) {
		const { member } = makeMember(subspaceId, date, image);
		const entries = await member.flushDirtyEntries();
		const response = await putEntries(entries.map((entry) => entry.entryWithPayload));
		const responseBody = response.body;
		assert(responseBody);
		assert(typeof responseBody === "object");
		assert.strictEqual(responseBody["entries"], undefined);
		await checkEntriesAreServed(entries);
		return { member, entries, response, responseBody };
	}
	async function createAndDeleteMember(subspaceId: SubspaceId = env.users.user1.keys.publicKey) {
		const { member, entries } = await createMember(subspaceId);
		const deleteEntry = await member.makePermanentDeleteEntry();
		const response = await putEntry(deleteEntry.entryWithPayload);
		return { member, createEntries: entries, deleteEntry, response };
	}

	async function createFront(subspaceId: SubspaceId) {
		const { member, entries: memberEntries } = await createMember(subspaceId);
		const { front } = makeFront(member, new Date());
		const entries = await front.flushDirtyEntries();
		const response = await putEntries(entries.map((entry) => entry.entryWithPayload));
		const responseBody = response.body;
		assert(responseBody);
		assert(typeof responseBody === "object");
		assert.strictEqual(responseBody["entries"], undefined);
		await checkEntriesAreServed(entries);
		return { front, entries, member, memberEntries, response, responseBody };
	}

	async function checkEntriesAreServed(
		entries: (EntryWrapper | Entry | EntryWithPayload)[],
		subspaceId: ByteString = env.users.user1.keys.publicKey,
		user: UserAuthData = env.users.user1,
	) {
		assert(entries.length > 0);

		const response = await getSyncFrom("", subspaceId, user);

		assert(response.entries);
		assert(response.entries.length > 0);

		const actualEntries = (
			await Promise.all(response.entries.map((entry: unknown) => EntryWrapper.load(entry)))
		).map((entry) => entry.entryMaybeWithPayload);

		const expectedEntries = entries.map((entry) =>
			entry instanceof EntryWrapper ? entry.entryMaybeWithPayload : entry,
		);
		for (const expectedEntry of expectedEntries) {
			const actualEntry = actualEntries.find((entry) =>
				Path.equals(entry.path, expectedEntry.path),
			);
			assert(actualEntry);
			assert.deepStrictEqual(actualEntry, expectedEntry);
		}
	}

	async function checkEntriesAreNotServed(entries: (EntryWrapper | Entry | EntryWithPayload)[]) {
		const response = await getSyncFrom("");
		assert(response.entries);

		const actualEntries = await Promise.all(
			response.entries.map((entry: unknown) => EntryWrapper.load(entry)),
		);

		for (const expectedEntry of entries) {
			for (const actualEntry of actualEntries) {
				assert.notDeepStrictEqual(
					actualEntry.entryWithPayload,
					expectedEntry instanceof EntryWrapper
						? expectedEntry.entryWithPayload
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
					image: "https://example.com/image.png",
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
					await putEntry(entry.entryWithPayload, expectCode, undefined);

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
			entry.payloadDigest.toBase64(),
		);
		assert(getObjectResult);

		await callback();

		getObjectResult = undefined;
		let error: unknown;
		try {
			getObjectResult = await s3Service.getObject(entry.payloadDigest.toBase64());
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
						entry.namespaceId = new Uint8Array(0);
						assert(EntryWithPayload.is(entry));
					},
				},
				{
					name: "wrong namespaceId 400",
					forgeEntry: (entry) => {
						entry.namespaceId = ByteString.fromUtf8("not the correct namespaceId");
						assert(EntryWithPayload.is(entry));
					},
				},

				// subspaceId
				{
					name: "correct subspaceId 200",
					forgeEntry: (entry) => {
						entry.subspaceId = env.users.user1.keys.publicKey;
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "empty subspaceId 400",
					forgeEntry: (entry) => {
						entry.subspaceId = new Uint8Array(0);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 400,
				},
				{
					name: "invalid subspaceId 400",
					forgeEntry: (entry) => {
						entry.subspaceId = ByteString.fromUtf8("not the correct subspaceId");
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 400,
				},
				{
					name: "other user's subspaceId 403",
					forgeEntry: (entry) => {
						entry.subspaceId = env.users.user2.keys.publicKey;
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 403,
				},

				// path
				{
					name: "empty path 200",
					forgeEntry: (entry) => {
						entry.path = [];
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "single empty component path 200",
					forgeEntry: (entry) => {
						entry.path = Path.fromString("/");
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "single component path 200",
					forgeEntry: (entry) => {
						entry.path = Path.fromString("/hi");
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "path with empty components 200",
					forgeEntry: (entry) => {
						entry.path = Path.fromString("//hi///hello//bye/");
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "too long path 400",
					forgeEntry: (entry) => {
						entry.path = Path.fromString(
							"/" + "a".repeat(Willow25.MAX_PATH_LENGTH + 1),
						);
						assert(EntryWithPayload.is(entry));
					},
				},
				{
					name: "just long enough path 200",
					forgeEntry: (entry) => {
						entry.path = Path.fromString("/" + "a".repeat(Willow25.MAX_PATH_LENGTH));
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},

				// timestamp
				{
					name: "now timestamp 200",
					forgeEntry: (entry) => {
						entry.timestamp = Timestamp.now();
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "0 timestamp 200",
					forgeEntry: (entry) => {
						entry.timestamp = 0n;
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "timestamp 15min in the future 400",
					forgeEntry: (entry) => {
						entry.timestamp = Timestamp.now().valueOf() + 15n * 60n * 1000_000n;
						assert(EntryWithPayload.is(entry));
					},
				},
				{
					name: "timestamp 5min in the future 200",
					forgeEntry: (entry) => {
						entry.timestamp = Timestamp.now().valueOf() + 5n * 60n * 1000_000n;
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "timestamp max uint64 with non-empty payload 400",
					forgeEntry: (entry) => {
						entry.timestamp = UInt64.MAX_VALUE;
						assert(EntryWithPayload.is(entry));
					},
				},
				{
					name: "timestamp max uint64 with empty payload 200",
					forgeEntry: async (entry) => {
						entry.timestamp = UInt64.MAX_VALUE;
						entry.payload = new Uint8Array(0);
						entry.payloadLength = 0n;
						entry.payloadDigest = await PayloadDigest.hash(entry.payload);
						assert(EntryWithPayload.is(entry));
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
						assert(EntryWithPayload.is(entry));
					},
				},

				// payloadDigest
				{
					name: "wrong payloadDigest 400",
					forgeEntry: async (entry) => {
						const forgedPayload = crypto.getRandomValues(Buffer.alloc(32));
						assert.notStrictEqual(forgedPayload, entry.payload);

						const forgedDigest = await PayloadDigest.hash(forgedPayload);
						assert.notStrictEqual(forgedDigest, entry.payloadDigest);

						entry.payloadDigest = forgedDigest;
						assert(EntryWithPayload.is(entry));
					},
				},

				// payload
				{
					name: "empty payload 200",
					forgeEntry: async (entry) => {
						entry.payload = new Uint8Array(0);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await PayloadDigest.hash(entry.payload);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "empty payload with wrong payloadLength 400",
					forgeEntry: async (entry) => {
						entry.payload = new Uint8Array(0);
						entry.payloadDigest = await PayloadDigest.hash(entry.payload);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 400,
				},
				{
					name: "empty payload with wrong payloadDigest 400",
					forgeEntry: (entry) => {
						entry.payload = new Uint8Array(0);
						entry.payloadLength = BigInt(entry.payload.length);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 400,
				},
				{
					name: "small payload (<=8192) 200",
					forgeEntry: async (entry) => {
						entry.payload = ByteString.fromUtf8("a".repeat(MAX_IN_DB_PAYLOAD_LENGTH));
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await PayloadDigest.hash(entry.payload);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "large payload (>8192) 200",
					forgeEntry: async (entry) => {
						entry.payload = ByteString.fromUtf8(
							"a".repeat(MAX_IN_DB_PAYLOAD_LENGTH + 1),
						);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await PayloadDigest.hash(entry.payload);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "payload length at limit 200",
					forgeEntry: async (entry) => {
						entry.payload = ByteString.fromUtf8(
							"a".repeat(
								env.configService.getOrThrow("MAX_UPLOAD_SIZE", {
									infer: true,
								}),
							),
						);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await PayloadDigest.hash(entry.payload);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "payload length over limit 413",
					forgeEntry: async (entry) => {
						entry.payload = ByteString.fromUtf8(
							"a".repeat(
								env.configService.getOrThrow("MAX_UPLOAD_SIZE", {
									infer: true,
								}) + 1,
							),
						);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await PayloadDigest.hash(entry.payload);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 413,
				},
				{
					name: "payload with null byte 200",
					forgeEntry: async (entry) => {
						entry.payload = new Uint8Array([0x00]);
						entry.payloadLength = BigInt(entry.payload.length);
						entry.payloadDigest = await PayloadDigest.hash(entry.payload);
						assert(EntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
			];

			for (const testCase of testCases) {
				test(testCase.name, async () => {
					const { member } = makeMember(env.users.user1.keys.publicKey);
					const entry = (await member.flushDirtyEntries())[0].entryMaybeWithPayload;
					assert(EntryWithPayload.is(entry));

					await testCase.forgeEntry(entry as EntryWithPayload & Record<string, unknown>);

					await putEntry(
						entry,
						typeof testCase.expectCode === "number" ? testCase.expectCode : 400,
						undefined,
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
			const { member } = makeMember(env.users.user1.keys.publicKey);
			const entries = await member.flushDirtyEntries();
			const unrelatedEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + createId()),
				Timestamp.now(),
				ByteString.fromUtf8("hi"),
			);

			await putEntries([...entries, unrelatedEntry].map((entry) => entry.entryWithPayload));
			await checkEntriesAreServed([...entries, unrelatedEntry]);

			const memberDeleteEntry = await member.makePermanentDeleteEntry();
			await putEntry(memberDeleteEntry.entryWithPayload);
			await checkEntriesAreServed([memberDeleteEntry, unrelatedEntry]);
			await checkEntriesAreNotServed(entries);

			await putEntry(memberDeleteEntry.entryWithPayload);
			await checkEntriesAreServed([memberDeleteEntry, unrelatedEntry]);
			await checkEntriesAreNotServed(entries);
		});

		test("Putting an entry that is superseded by another entry of the same path has no effect", async () => {
			const root = createId();
			const entry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root + "/a"),
				1n,
				ByteString.fromUtf8("hi"),
			);
			const supersedingEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root + "/a"),
				2n,
				ByteString.fromUtf8("bye"),
			);

			await putEntry(supersedingEntry.entryWithPayload);
			await checkEntriesAreServed([supersedingEntry]);

			await putEntry(entry.entryWithPayload);
			await checkEntriesAreNotServed([entry]);
			await checkEntriesAreServed([supersedingEntry]);
		});

		test("Putting an entry that is superseded by another entry of a prefixing path has no effect", async () => {
			const root = createId();
			const entry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root + "/child"),
				1n,
				ByteString.fromUtf8("hi"),
			);
			const supersedingEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root),
				2n,
				ByteString.fromUtf8("bye"),
			);

			await putEntry(supersedingEntry.entryWithPayload);
			await checkEntriesAreServed([supersedingEntry]);

			await putEntry(entry.entryWithPayload);
			await checkEntriesAreNotServed([entry]);
			await checkEntriesAreServed([supersedingEntry]);
		});

		test("Putting an entry older than another entry it prefixes after the latter keeps both entries", async () => {
			const root = createId();
			const parentEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root),
				1n,
				ByteString.fromUtf8("hi"),
			);
			const childEntry = await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root + "/child"),
				2n,
				ByteString.fromUtf8("bye"),
			);

			await putEntry(childEntry.entryWithPayload);
			await checkEntriesAreServed([childEntry]);

			await putEntry(parentEntry.entryWithPayload);
			await checkEntriesAreServed([parentEntry, childEntry]);
		});

		describe("PUT create Member", () => {
			test("200", async () => {
				const { member } = makeMember(env.users.user1.keys.publicKey);

				const entries = await member.flushDirtyEntries();
				await putEntries(entries.map((entry) => entry.entryWithPayload));
				await checkEntriesAreServed(entries);
			});

			test("minimal create data 200", async () => {
				const { member } = makeMember(
					env.users.user1.keys.publicKey,
					undefined,
					undefined,
					true,
				);

				const entries = await member.flushDirtyEntries();
				await putEntries(entries.map((entry) => entry.entryWithPayload));
				await checkEntriesAreServed(entries);
			});

			testImage(async (image) => {
				const { member } = makeMember(env.users.user1.keys.publicKey);

				if (image && typeof image !== "string") {
					member.set("image", readFile(image.filePath));
				} else {
					member.set("image", image === null ? undefined : image);
				}

				const entry = (await member.flushDirtyEntries()).find((entry) =>
					Path.endsWith(entry.path, Path.fromString("/image")),
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

				await putEntry((await member.makePermanentDeleteEntry()).entryWithPayload);
			});

			test("delete member of another user fails 403", async () => {
				const { member, entries } = await createMember(env.users.user1.keys.publicKey);

				const deleteEntry = await member.makeDeleteEntry();
				await putEntry(deleteEntry.entryWithPayload, 403, env.users.user2);

				// Check member was not deleted
				await checkEntriesAreServed(entries);
			});

			test("Delete member with image deletes image from s3", async () => {
				const { member, entries } = await createMember(
					env.users.user1.keys.publicKey,
					undefined,
					readFile(LARGE_IMAGE_FILE_PATH) +
						crypto.getRandomValues(Buffer.alloc(32)).toString(),
				);

				const imageEntry = entries.find((entry) =>
					Path.endsWith(entry.path, Path.fromString("/image")),
				);
				assert(imageEntry);

				await testPayloadIsDeletedFromS3(imageEntry, async () => {
					await putEntry((await member.makeDeleteEntry()).entryWithPayload, 200);
				});
			});

			test("Delete member's image deletes image from s3", async () => {
				const { entries } = await createMember(
					env.users.user1.keys.publicKey,
					undefined,
					readFile(LARGE_IMAGE_FILE_PATH) +
						crypto.getRandomValues(Buffer.alloc(32)).toString(),
				);

				const imageEntry = entries.find((entry) =>
					Path.endsWith(entry.path, Path.fromString("/image")),
				);
				assert(imageEntry);

				await testPayloadIsDeletedFromS3(imageEntry, async () => {
					const deleteEntry = await EntryWrapper.load(imageEntry);
					await deleteEntry.setPayload(new Uint8Array(0));
					await putEntry(deleteEntry.entryWithPayload, 200);
				});
			});
		});

		describe("PUT update Member", () => {
			test("200", async () => {
				const { member } = await createMember(env.users.user1.keys.publicKey);

				member.assign({
					pronouns: "she/they",
					description: "a member of our& system who went through some changes",
					isArchived: true,
					archivedReason: "a reason for archival",
				});
				const updateEntries = await member.flushDirtyEntries();
				await putEntries(updateEntries.map((entry) => entry.entryWithPayload));

				await checkEntriesAreServed(updateEntries);
			});

			test("update member of another user fails 403", async () => {
				const { member, entries } = await createMember(env.users.user1.keys.publicKey);
				const expectedEntries = entries.map((entry) => entry.entryMaybeWithPayload);

				member.set("name", "a new name");
				const updateEntries = await member.flushDirtyEntries();
				await putEntries(
					updateEntries.map((entry) => entry.entryWithPayload),
					403,
					env.users.user2,
				);

				await checkEntriesAreServed(expectedEntries);
				await checkEntriesAreNotServed(updateEntries);
			});

			test("update member that was already deleted succeeds 200", async () => {
				const { member } = await createAndDeleteMember();
				member.set("name", "a new name");

				const entries = await member.flushDirtyEntries();
				await putEntries(entries.map((entry) => entry.entryWithPayload));
				await checkEntriesAreNotServed(entries);
			});

			testImage(async (image) => {
				const { member } = await createMember(env.users.user1.keys.publicKey);

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
			const { member, entries } = await createMember(
				env.users.user1.keys.publicKey,
				undefined,
				bigData,
			);

			const originalImageEntry = entries.find((entry) =>
				Path.endsWith(entry.path, Path.fromString("/image")),
			)?.entryMaybeWithPayload;
			assert(originalImageEntry);

			member.set("image", undefined);

			const deleteImageEntry = (await member.flushDirtyEntries())[0];

			await testPayloadIsDeletedFromS3(originalImageEntry, async () => {
				await putEntry(deleteImageEntry.entryWithPayload, 200);
			});
		});

		// TODO: test payload is not uploaded to s3 if entry is pruned on upsert or if it's deleted on post-upsert prune

		async function testPuttingALotOfEntries(
			callback: ({
				user,
				entries,
			}: {
				user: UserAuthData;
				entries: EntryWithPayload[];
			}) => Promise<void>,
		) {
			const user = env.users.user1;
			const subspaceId = env.users.user1.keys.publicKey;
			const { member: memberToDelete } = makeMember(user.keys.publicKey);

			await putEntries(await timeModelEntries(memberToDelete, 0n), undefined, user);

			const members = [
				makeMember(user.keys.publicKey),
				makeMember(user.keys.publicKey),
				makeMember(user.keys.publicKey),
			];

			const entries: EntryWithPayload[] = [
				...(await timeModelEntries(members[0].member, 1n)),
				...(await timeModelEntries(members[1].member, 2n)),
				await EntryWrapper.create(
					OPENSELVES_NAMESPACE_ID,
					user.keys.publicKey,
					Path.fromString(
						Path.toString(members[1].member.getPathRoot()) + "/description",
					),
					3n,
					ByteString.fromUtf8("a new description"),
				),
				...(await timeModelEntries(members[2].member, 4n)),
				await EntryWrapper.create(
					OPENSELVES_NAMESPACE_ID,
					user.keys.publicKey,
					Path.fromString(Path.toString(members[0].member.getPathRoot()) + "/pronouns"),
					5n,
					ByteString.fromUtf8("iel/ellui"),
				),
				await memberToDelete.makeDeleteEntry(6n),
			].map((entry) => (entry instanceof EntryWrapper ? entry.entryWithPayload : entry));
			members[2].member.assign({
				pronouns: "they/them",
				isArchived: true,
				archivedReason: "a reason",
			});
			entries.push(...(await timeModelEntries(members[2].member, 7n)));

			await callback({ user, entries });

			const response = await getSyncFrom("", subspaceId, user);
			assert(Array.isArray(response.entries));
			// 3 members times 8 fields plus one deleted member
			assert.strictEqual(response.entries.length, 3 * 8 + 1);
		}

		test("PUT create, update and delete members all at once 200", async () => {
			await testPuttingALotOfEntries(async ({ user, entries }) => {
				await putEntries(entries, undefined, user);
			});
		});

		test("PUT create, update and delete members one by one in random order 200", async () => {
			await testPuttingALotOfEntries(async ({ user, entries }) => {
				const shuffledEntries = shuffleArray(entries);
				for (const entry of shuffledEntries) {
					await putEntry(entry, undefined, user);
				}
			});
		});

		async function setupEntryMatrix() {
			const member = makeMember(env.users.user1.keys.publicKey);
			await putEntries(await timeModelEntries(member.member, 0n));

			const client1Entries: EntryWithPayload[] = [];
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

			const client2Entries: EntryWithPayload[] = [];
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
			assert(Array.isArray(response.entries));

			const entries = await Promise.all(
				response.entries
					.filter((entry) => Path.extends(entry.path, member.getPathRoot()))
					.map((entry) => EntryWrapper.load(entry, entry.payload)),
			);
			const reconstructedMember = new Member(member.subspaceId, entries);

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
			await createFront(env.users.user1.keys.publicKey);
		});

		test("update front", async () => {
			const { front } = await createFront(env.users.user1.keys.publicKey);
			front.assign({
				note: "hi",
				endedAt: new Date(),
			});
			const entries = await front.flushDirtyEntries();
			await putEntries(entries.map((entry) => entry.entryWithPayload));
			await checkEntriesAreServed(entries);
		});

		test("delete front", async () => {
			const { front, entries } = await createFront(env.users.user1.keys.publicKey);
			const deleteEntry = await front.makeDeleteEntry();
			await putEntry(deleteEntry.entryWithPayload);
			await checkEntriesAreServed([deleteEntry]);
			await checkEntriesAreNotServed(entries);
		});
	});
});
