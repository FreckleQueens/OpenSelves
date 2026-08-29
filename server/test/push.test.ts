import { type GetObjectCommandOutput, NoSuchKey } from "@aws-sdk/client-s3";
import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import test, { before, describe } from "node:test";
import { OPENSELVES_NAMESPACE_ID, shuffleArray } from "openselves-common";
import { type AnyEntryDataModel, Front, Member } from "openselves-common/client";
import {
	AuthorisedEntry,
	AuthorisedEntryWithPayload,
	ByteString,
	CapabilitySignData,
	Ed25519,
	type Ed25519KeyPair,
	Entry,
	MemoryStore,
	NamespaceId,
	Path,
	PayloadDigest,
	Timestamp,
	UInt64,
	Willow25,
} from "openselves-common/willow";

import { S3Service } from "../src/sync/s3.service.js";
import {
	type FileRef,
	LARGE_IMAGE_FILE_PATH,
	TEST_IMAGE_DATA_URL,
	TEST_IMAGE_LONG_DATA_URL,
	makeMember,
	checkEntriesAreNotServed as originalCheckEntriesAreNotServed,
	checkEntriesAreServed as originalCheckEntriesAreServed,
	getSyncFrom as originalGetSyncFrom,
	putEntries as originalPutEntries,
	putEntry as originalPutEntry,
	pushEndpoint,
	readFile,
} from "./sync-utils.js";
import { type TestEnvUser, type TestEnvWithUsers, setupTestSuiteWithUsers } from "./utils.js";

type ForgedEntry = Omit<
	AuthorisedEntryWithPayload,
	"namespaceId" | "subspaceId" | "payloadDigest"
> & {
	namespaceId: ByteString;
	subspaceId: ByteString;
	payloadDigest: ByteString;
} & Record<string, unknown>;

async function timeModelEntries(
	model: AnyEntryDataModel,
	timestamp: Timestamp,
	signData: CapabilitySignData,
): Promise<AuthorisedEntryWithPayload[]> {
	return Promise.all(
		(await model.flushDirtyEntries(signData)).map((entry) => {
			entry.timestamp = timestamp;
			return AuthorisedEntryWithPayload.signEntry(entry, signData);
		}),
	);
}

describe(pushEndpoint, () => {
	let env: TestEnvWithUsers;
	const putEntry = (
		entry: AuthorisedEntryWithPayload,
		expectCode: number = 200,
		user: TestEnvUser = env.users.user1,
	) => originalPutEntry(env, entry, expectCode, user);
	const putEntries = (
		entries: AuthorisedEntryWithPayload[],
		expectCode: number = 200,
		user: TestEnvUser = env.users.user1,
	) => originalPutEntries(env, entries, expectCode, user);

	const getSyncFrom = (timestamp: string, user: TestEnvUser = env.users.user1) =>
		originalGetSyncFrom(env, timestamp, user);

	const checkEntriesAreServed = (
		entries: AuthorisedEntryWithPayload[],
		user: TestEnvUser = env.users.user1,
	) => originalCheckEntriesAreServed(env, entries, user);

	const checkEntriesAreNotServed = (
		entries: AuthorisedEntryWithPayload[],
		user: TestEnvUser = env.users.user1,
	) => originalCheckEntriesAreNotServed(env, entries, user);

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
		keys: Ed25519KeyPair,
		date?: Date,
		image?: string | FileRef | null,
	) {
		const { member } = makeMember(keys.publicKey, date, image);
		const entries = await member.flushDirtyEntries(keys);
		const response = await putEntries(entries);
		const responseBody = response.body;
		assert(responseBody);
		assert(typeof responseBody === "object");
		assert.strictEqual(responseBody["entries"], undefined);
		await checkEntriesAreServed(entries);
		return { member, entries, response, responseBody };
	}
	async function createAndDeleteMember(keys: Ed25519KeyPair = env.users.user1.keys) {
		const { member, entries } = await createMember(keys);
		const deleteEntry = await member.makePermanentDeleteEntry(keys);
		const response = await putEntry(deleteEntry);
		return { member, createEntries: entries, deleteEntry, response };
	}

	async function createFront(keys: Ed25519KeyPair) {
		const { member, entries: memberEntries } = await createMember(keys);
		const { front } = makeFront(member, new Date());
		const entries = await front.flushDirtyEntries(keys);
		const response = await putEntries(entries);
		const responseBody = response.body;
		assert(responseBody);
		assert(typeof responseBody === "object");
		assert.strictEqual(responseBody["entries"], undefined);
		await checkEntriesAreServed(entries);
		return { front, entries, member, memberEntries, response, responseBody };
	}

	function testImage(
		testFn: (image: string | FileRef | null | undefined) => Promise<AuthorisedEntryWithPayload>,
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

	async function testEntryNotInS3(entry: Entry) {
		const s3Service = env.app.get(S3Service);

		let getObjectResult: GetObjectCommandOutput | undefined;
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

	let maxInDbPayloadLength: number;
	before(() => {
		maxInDbPayloadLength = env.configService.getOrThrow("MAX_IN_DB_PAYLOAD_LENGTH", {
			infer: true,
		});
	});

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
				forgeEntry: (entry: ForgedEntry) => Promise<void> | void;
				expectCode?: number;
				expectServe?: boolean;
			};

			async function setEntryPayloadToForged(
				payload: ByteString,
				entry: ForgedEntry,
				payloadDigest?: ByteString,
				payloadLength: UInt64 = BigInt(payload.length),
			) {
				entry.payload = payload;
				entry.payloadLength = payloadLength;
				entry.payloadDigest =
					payloadDigest === undefined ? await PayloadDigest.hash(payload) : payloadDigest;
				entry.authorisationToken = (
					await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
				).authorisationToken;
			}

			const testCases: TestCase[] = [
				{
					name: "control 200",
					forgeEntry: () => {},
					expectCode: 200,
				},

				// namespaceId
				{
					name: "wrong namespaceId 400",
					forgeEntry: async (entry) => {
						entry.namespaceId = (
							await NamespaceId.generateRandomCommunalNamespaceKeys()
						).publicKey;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
				},

				// subspaceId
				{
					name: "correct subspaceId 200",
					forgeEntry: async (entry) => {
						entry.subspaceId = entry.authorisationToken.capability.inner.userKey =
							env.users.user1.keys.publicKey;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "random subspaceId 200",
					forgeEntry: async (entry) => {
						const keys = await Ed25519.generateKey();
						entry.subspaceId = keys.publicKey;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
					expectServe: false,
				},
				{
					name: "authored by another user 200",
					forgeEntry: async (entry) => {
						entry.subspaceId = env.users.user2.keys.publicKey;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user2.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
					expectServe: false,
				},

				// path
				{
					name: "empty path 200",
					forgeEntry: async (entry) => {
						entry.path = [];
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "single empty component path 200",
					forgeEntry: async (entry) => {
						entry.path = Path.fromString("/");
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "single component path 200",
					forgeEntry: async (entry) => {
						entry.path = Path.fromString("/hi");
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "path with empty components 200",
					forgeEntry: async (entry) => {
						entry.path = Path.fromString("//hi///hello//bye/");
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "too long path 400",
					forgeEntry: async (entry) => {
						entry.path = Path.fromString(
							"/" + "a".repeat(Willow25.MAX_PATH_LENGTH + 1),
						);
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
				},
				{
					name: "just long enough path 200",
					forgeEntry: async (entry) => {
						entry.path = Path.fromString("/" + "a".repeat(Willow25.MAX_PATH_LENGTH));
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},

				// timestamp
				{
					name: "now timestamp 200",
					forgeEntry: async (entry) => {
						entry.timestamp = Timestamp.now();
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "0 timestamp 200",
					forgeEntry: async (entry) => {
						entry.timestamp = 0n;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "timestamp 15min in the future 400",
					forgeEntry: async (entry) => {
						entry.timestamp = Timestamp.now().valueOf() + 15n * 60n * 1000_000n;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
				},
				{
					name: "timestamp 5min in the future 200",
					forgeEntry: async (entry) => {
						entry.timestamp = Timestamp.now().valueOf() + 5n * 60n * 1000_000n;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "timestamp max uint64 with non-empty payload 400",
					forgeEntry: async (entry) => {
						entry.timestamp = UInt64.MAX_VALUE;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
				},
				{
					name: "timestamp max uint64 with empty payload 200",
					forgeEntry: async (entry) => {
						entry.timestamp = UInt64.MAX_VALUE;
						await setEntryPayloadToForged(ByteString.empty(), entry);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},

				// payloadLength
				{
					name: "wrong payloadLength 400",
					forgeEntry: async (entry) => {
						const forgedLength = 999999999n;
						assert(entry.payload);
						assert.notStrictEqual(Number(forgedLength), entry.payload.length);
						entry.payloadLength = forgedLength;
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
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
						entry.authorisationToken = (
							await AuthorisedEntry.signEntry(entry as Entry, env.users.user1.keys)
						).authorisationToken;
						assert(AuthorisedEntryWithPayload.is(entry));
					},
				},

				// payload
				{
					name: "empty payload 200",
					forgeEntry: async (entry) => {
						await setEntryPayloadToForged(ByteString.empty(), entry);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "empty payload with wrong payloadLength 400",
					forgeEntry: async (entry) => {
						await setEntryPayloadToForged(
							ByteString.empty(),
							entry,
							undefined,
							entry.payloadLength,
						);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 400,
				},
				{
					name: "empty payload with wrong payloadDigest 400",
					forgeEntry: async (entry) => {
						await setEntryPayloadToForged(
							ByteString.empty(),
							entry,
							entry.payloadDigest,
						);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 400,
				},
				{
					name: `small payload (<=${maxInDbPayloadLength}) 200`,
					forgeEntry: async (entry) => {
						await setEntryPayloadToForged(
							ByteString.fromUtf8("a".repeat(maxInDbPayloadLength)),
							entry,
						);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: `large payload (>${maxInDbPayloadLength}) 200`,
					forgeEntry: async (entry) => {
						await setEntryPayloadToForged(
							ByteString.fromUtf8("a".repeat(maxInDbPayloadLength + 1)),
							entry,
						);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "payload length at limit 200",
					forgeEntry: async (entry) => {
						await setEntryPayloadToForged(
							ByteString.fromUtf8(
								"a".repeat(
									env.configService.getOrThrow("MAX_UPLOAD_SIZE", {
										infer: true,
									}),
								),
							),
							entry,
						);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
				{
					name: "payload length over limit 413",
					forgeEntry: async (entry) => {
						await setEntryPayloadToForged(
							ByteString.fromUtf8(
								"a".repeat(
									env.configService.getOrThrow("MAX_UPLOAD_SIZE", {
										infer: true,
									}) + 1,
								),
							),
							entry,
						);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 413,
				},
				{
					name: "payload with null byte 200",
					forgeEntry: async (entry) => {
						await setEntryPayloadToForged(new Uint8Array([0x00]), entry);
						assert(AuthorisedEntryWithPayload.is(entry));
					},
					expectCode: 200,
				},
			];

			for (const testCase of testCases) {
				test(testCase.name, async () => {
					const { member } = makeMember(env.users.user1.keys.publicKey);
					const entry = (await member.flushDirtyEntries(env.users.user1.keys))[0];
					assert(AuthorisedEntryWithPayload.is(entry));

					await testCase.forgeEntry(
						entry as AuthorisedEntryWithPayload & Record<string, unknown>,
					);

					await putEntry(
						entry,
						typeof testCase.expectCode === "number" ? testCase.expectCode : 400,
						undefined,
					);

					if (
						testCase.expectServe === true ||
						(testCase.expectServe !== false && testCase.expectCode === 200)
					) {
						await checkEntriesAreServed([entry]);
					} else {
						await checkEntriesAreNotServed([entry]);
					}
				});
			}
		});

		test("Putting an entry twice only has an effect the first time", async () => {
			const { member } = makeMember(env.users.user1.keys.publicKey);
			const entries = await member.flushDirtyEntries(env.users.user1.keys);
			const unrelatedEntry = await AuthorisedEntryWithPayload.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + createId()),
				Timestamp.now(),
				ByteString.fromUtf8("hi"),
				env.users.user1.keys,
			);

			await putEntries([...entries, unrelatedEntry]);
			await checkEntriesAreServed([...entries, unrelatedEntry]);

			const memberDeleteEntry = await member.makePermanentDeleteEntry(env.users.user1.keys);
			await putEntry(memberDeleteEntry);
			await checkEntriesAreServed([memberDeleteEntry, unrelatedEntry]);
			await checkEntriesAreNotServed(entries);

			await putEntry(memberDeleteEntry);
			await checkEntriesAreServed([memberDeleteEntry, unrelatedEntry]);
			await checkEntriesAreNotServed(entries);
		});

		test("Putting an entry that is superseded by another entry of the same path has no effect", async () => {
			const root = createId();
			const entry = await AuthorisedEntryWithPayload.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root + "/a"),
				1n,
				ByteString.fromUtf8("hi"),
				env.users.user1.keys,
			);
			const supersedingEntry = await AuthorisedEntryWithPayload.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root + "/a"),
				2n,
				ByteString.fromUtf8("bye"),
				env.users.user1.keys,
			);

			await putEntry(supersedingEntry);
			await checkEntriesAreServed([supersedingEntry]);

			await putEntry(entry);
			await checkEntriesAreNotServed([entry]);
			await checkEntriesAreServed([supersedingEntry]);
		});

		test("Putting an entry that is superseded by another entry of a prefixing path has no effect", async () => {
			const root = createId();
			const entry = await AuthorisedEntryWithPayload.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root + "/child"),
				1n,
				ByteString.fromUtf8("hi"),
				env.users.user1.keys,
			);
			const supersedingEntry = await AuthorisedEntryWithPayload.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root),
				2n,
				ByteString.fromUtf8("bye"),
				env.users.user1.keys,
			);

			await putEntry(supersedingEntry);
			await checkEntriesAreServed([supersedingEntry]);

			await putEntry(entry);
			await checkEntriesAreNotServed([entry]);
			await checkEntriesAreServed([supersedingEntry]);
		});

		test("Putting an entry older than another entry it prefixes after the latter keeps both entries", async () => {
			const root = createId();
			const parentEntry = await AuthorisedEntryWithPayload.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root),
				1n,
				ByteString.fromUtf8("hi"),
				env.users.user1.keys,
			);
			const childEntry = await AuthorisedEntryWithPayload.create(
				OPENSELVES_NAMESPACE_ID,
				env.users.user1.keys.publicKey,
				Path.fromString("/test/" + root + "/child"),
				2n,
				ByteString.fromUtf8("bye"),
				env.users.user1.keys,
			);

			await putEntry(childEntry);
			await checkEntriesAreServed([childEntry]);

			await putEntry(parentEntry);
			await checkEntriesAreServed([parentEntry, childEntry]);
		});

		describe("PUT create Member", () => {
			test("200", async () => {
				const { member } = makeMember(env.users.user1.keys.publicKey);

				const entries = await member.flushDirtyEntries(env.users.user1.keys);
				await putEntries(entries);
				await checkEntriesAreServed(entries);
			});

			test("minimal create data 200", async () => {
				const { member } = makeMember(
					env.users.user1.keys.publicKey,
					undefined,
					undefined,
					true,
				);

				const entries = await member.flushDirtyEntries(env.users.user1.keys);
				await putEntries(entries);
				await checkEntriesAreServed(entries);
			});

			testImage(async (image) => {
				const { member } = makeMember(env.users.user1.keys.publicKey);

				if (image && typeof image !== "string") {
					member.set("image", readFile(image.filePath));
				} else {
					member.set("image", image === null ? undefined : image);
				}

				const entry = (await member.flushDirtyEntries(env.users.user1.keys)).find((entry) =>
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

				await putEntry(await member.makePermanentDeleteEntry(env.users.user1.keys));
			});

			test("delete member of another user fails 400", async () => {
				const { member, entries } = await createMember(env.users.user1.keys);

				const deleteEntry = await member.makeDeleteEntry(env.users.user2.keys);
				await putEntry(deleteEntry, 400, env.users.user2);

				// Check member was not deleted
				await checkEntriesAreServed(entries);
			});

			test("Delete member with image deletes image from s3", async () => {
				const { member, entries } = await createMember(
					env.users.user1.keys,
					undefined,
					readFile(LARGE_IMAGE_FILE_PATH) +
						crypto.getRandomValues(Buffer.alloc(32)).toString(),
				);

				const imageEntry = entries.find((entry) =>
					Path.endsWith(entry.path, Path.fromString("/image")),
				);
				assert(imageEntry);

				await testPayloadIsDeletedFromS3(imageEntry, async () => {
					await putEntry(await member.makeDeleteEntry(env.users.user1.keys), 200);
				});
			});

			test("Delete member's image deletes image from s3", async () => {
				const { entries } = await createMember(
					env.users.user1.keys,
					undefined,
					readFile(LARGE_IMAGE_FILE_PATH) +
						crypto.getRandomValues(Buffer.alloc(32)).toString(),
				);

				const imageEntry = entries.find((entry) =>
					Path.endsWith(entry.path, Path.fromString("/image")),
				);
				assert(imageEntry);

				await testPayloadIsDeletedFromS3(imageEntry, async () => {
					const deleteImageEntry = await AuthorisedEntryWithPayload.setPayload(
						imageEntry,
						ByteString.empty(),
						{
							signData: env.users.user1.keys,
						},
					);
					await putEntry(deleteImageEntry, 200);
				});
			});
		});

		describe("PUT update Member", () => {
			test("200", async () => {
				const { member } = await createMember(env.users.user1.keys);

				member.assign({
					pronouns: "she/they",
					description: "a member of our& system who went through some changes",
					isArchived: true,
					archivedReason: "a reason for archival",
				});
				const updateEntries = await member.flushDirtyEntries(env.users.user1.keys);
				await putEntries(updateEntries);

				await checkEntriesAreServed(updateEntries);
			});

			test("update member of another user fails 400", async () => {
				const { member, entries: expectedEntries } = await createMember(
					env.users.user1.keys,
				);

				member.set("name", "a new name");
				const updateEntries = await member.flushDirtyEntries(env.users.user2.keys);
				await putEntries(updateEntries, 400, env.users.user2);

				await checkEntriesAreServed(expectedEntries);
				await checkEntriesAreNotServed(updateEntries);
			});

			test("update member that was already deleted succeeds 200", async () => {
				const { member } = await createAndDeleteMember();
				member.set("name", "a new name");

				const entries = await member.flushDirtyEntries(env.users.user1.keys);
				await putEntries(entries);
				await checkEntriesAreNotServed(entries);
			});

			testImage(async (image) => {
				const { member } = await createMember(env.users.user1.keys);

				if (image && typeof image !== "string") {
					member.set("image", readFile(image.filePath));
				} else {
					member.set("image", image === null ? undefined : image);
				}

				return (await member.flushDirtyEntries(env.users.user1.keys))[0];
			});
		});

		test("Set member with image image's to undefined deletes image from s3", async () => {
			const randomValues = crypto.getRandomValues(Buffer.alloc(5000));
			const bigData = randomValues.toString("hex");
			assert(bigData.length > maxInDbPayloadLength);
			const { member, entries } = await createMember(
				env.users.user1.keys,
				undefined,
				bigData,
			);

			const originalImageEntry = entries.find((entry) =>
				Path.endsWith(entry.path, Path.fromString("/image")),
			);
			assert(originalImageEntry);

			member.set("image", undefined);

			const deleteImageEntry = (await member.flushDirtyEntries(env.users.user1.keys))[0];

			await testPayloadIsDeletedFromS3(originalImageEntry, async () => {
				await putEntry(deleteImageEntry, 200);
			});
		});

		test("payload is not uploaded to s3 if entry is prefix-pruned from existing entries in db", async () => {
			const randomValues = crypto.getRandomValues(Buffer.alloc(5000));
			const bigData = randomValues.toString("hex");
			assert(bigData.length > maxInDbPayloadLength);

			const keys = env.users.user1.keys;
			const { member } = makeMember(keys.publicKey, undefined, bigData);
			const entries = await member.flushDirtyEntries(keys);

			const originalImageEntry = entries.find((entry) =>
				Path.endsWith(entry.path, Path.fromString("/image")),
			);
			assert(originalImageEntry);

			const newPayload = ByteString.fromUtf8("smol");
			const newImageEntry: AuthorisedEntryWithPayload =
				await AuthorisedEntryWithPayload.setPayload(originalImageEntry, newPayload, {
					signData: keys,
				});

			// Insert the newest entry first
			await putEntry(newImageEntry);
			await putEntries(entries);

			await testEntryNotInS3(originalImageEntry);
		});

		async function testPuttingALotOfEntries(
			callback: ({
				user,
				entries,
			}: {
				user: TestEnvUser;
				entries: AuthorisedEntryWithPayload[];
			}) => Promise<void>,
		) {
			const user = env.users.user1;
			const { member: memberToDelete } = makeMember(user.keys.publicKey);

			await putEntries(
				await timeModelEntries(memberToDelete, 0n, user.keys),
				undefined,
				user,
			);

			const members = [
				makeMember(user.keys.publicKey),
				makeMember(user.keys.publicKey),
				makeMember(user.keys.publicKey),
			];

			const entries: AuthorisedEntryWithPayload[] = [
				...(await timeModelEntries(members[0].member, 1n, user.keys)),
				...(await timeModelEntries(members[1].member, 2n, user.keys)),
				await AuthorisedEntryWithPayload.create(
					OPENSELVES_NAMESPACE_ID,
					user.keys.publicKey,
					Path.fromString(
						Path.toString(members[1].member.getPathRoot()) + "/description",
					),
					3n,
					ByteString.fromUtf8("a new description"),
					user.keys,
				),
				...(await timeModelEntries(members[2].member, 4n, user.keys)),
				await AuthorisedEntryWithPayload.create(
					OPENSELVES_NAMESPACE_ID,
					user.keys.publicKey,
					Path.fromString(Path.toString(members[0].member.getPathRoot()) + "/pronouns"),
					5n,
					ByteString.fromUtf8("iel/ellui"),
					user.keys,
				),
				await memberToDelete.makeDeleteEntry(user.keys, 6n),
			];
			members[2].member.assign({
				pronouns: "they/them",
				isArchived: true,
				archivedReason: "a reason",
			});
			entries.push(...(await timeModelEntries(members[2].member, 7n, user.keys)));

			await callback({ user, entries });

			const response = await getSyncFrom("", user);
			assert(response.entries);

			// 3 members times 8 fields plus one deleted member
			const expectedEntryCount = 3 * 8 + 1;

			const store = new MemoryStore(OPENSELVES_NAMESPACE_ID);
			await store.ingest(entries);
			assert.strictEqual(store.getEntries().length, expectedEntryCount);

			assert.strictEqual(response.entries.length, expectedEntryCount);
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
			await putEntries(await timeModelEntries(member.member, 0n, env.users.user1.keys));

			const client1Entries: AuthorisedEntryWithPayload[] = [];
			member.member.assign({
				name: "1",
				pronouns: "1",
				description: "1",
				isArchived: true,
				archivedReason: "1",
			});
			client1Entries.push(
				...(await timeModelEntries(member.member, 1n, env.users.user1.keys)),
			);
			member.member.assign({
				description: "3",
				archivedReason: "3",
			});
			client1Entries.push(
				...(await timeModelEntries(member.member, 3n, env.users.user1.keys)),
			);

			const client2Entries: AuthorisedEntryWithPayload[] = [];
			member.member.assign({
				pronouns: "2",
				description: "2",
				archivedReason: "2",
			});
			client2Entries.push(
				...(await timeModelEntries(member.member, 2n, env.users.user1.keys)),
			);
			member.member.assign({
				archivedReason: "4",
			});
			client2Entries.push(
				...(await timeModelEntries(member.member, 4n, env.users.user1.keys)),
			);

			return { member, client1Entries, client2Entries };
		}

		async function verifyEntryMatrixResult(member: Member) {
			const response = await getSyncFrom("");
			assert(Array.isArray(response.entries));

			const entries = response.entries.filter((entry) =>
				Path.extends(entry.path, member.getPathRoot()),
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
			await createFront(env.users.user1.keys);
		});

		test("update front", async () => {
			const { front } = await createFront(env.users.user1.keys);
			front.assign({
				note: "hi",
				endedAt: new Date(),
			});
			const entries = await front.flushDirtyEntries(env.users.user1.keys);
			await putEntries(entries);
			await checkEntriesAreServed(entries);
		});

		test("delete front", async () => {
			const { front, entries } = await createFront(env.users.user1.keys);
			const deleteEntry = await front.makeDeleteEntry(env.users.user1.keys);
			await putEntry(deleteEntry);
			await checkEntriesAreServed([deleteEntry]);
			await checkEntriesAreNotServed(entries);
		});
	});
});
