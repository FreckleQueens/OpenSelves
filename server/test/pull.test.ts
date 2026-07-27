import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import test, { before, describe } from "node:test";
import { readStream } from "openselves-common";
import { Member } from "openselves-common/client";
import {
	AuthorisationToken,
	ByteString,
	Capability,
	CapabilityAccessMode,
	EntryWrapper,
	NamespaceId,
	OPENSELVES_NAMESPACE_ID,
	Path,
	Timestamp,
	UInt64,
	UserPublicKey,
} from "openselves-common/willow";
import { Drop } from "openselves-common/willow";
import { AuthorisedEntryWithPayload } from "openselves-common/willow";
import { Area } from "openselves-common/willow";

import {
	type EntryCreate,
	byteStringArrayToPostgresByteaArrayLiteral,
	entries,
} from "../src/db/index.js";
import type { UserAuthData } from "./TestQueryBuilder.js";
import {
	checkEntriesAreServed,
	getSyncFrom as originalGetSyncFrom,
	putEntries,
} from "./sync-utils.js";
import {
	type TestEnvUser,
	type TestEnvWithUsers,
	createAndLoginUser,
	setupTestSuiteWithUsers,
} from "./utils.js";

const pullEndpoint = "/sync/pull";

describe("/sync/pull", () => {
	let env: TestEnvWithUsers;

	const getSyncFrom = (
		timestamp: string,
		user: UserAuthData & { keys: { publicKey: UserPublicKey } } = env.users.user1,
		expectStatus: number,
	) => originalGetSyncFrom(env, timestamp, user, expectStatus);

	let members1: Member[];
	let deletedMember1: Member;
	const entries1: EntryWrapper[] = [];
	let members2: Member[];
	const entries2: EntryWrapper[] = [];
	setupTestSuiteWithUsers((testEnv) => {
		env = testEnv;
	});

	before(async () => {
		let timestamp: number = Date.now() - 1000;
		const getDate = () => new Date(timestamp++);
		members1 = [
			new Member(env.users.user1.keys.publicKey, {
				name: "Alice",
				pronouns: "she/her",
				description: "a member of our& system",
				createdAt: getDate(),
			}),
			new Member(env.users.user1.keys.publicKey, {
				name: "Bob",
				pronouns: "he/him",
				description: "another member of our& system",
				createdAt: getDate(),
			}),
		];

		deletedMember1 = new Member(env.users.user1.keys.publicKey, {
			name: "Dex",
			pronouns: "they/them",
			description: "a deleted member of our& system",
			createdAt: getDate(),
		});

		members1[0].set("name", "a new name");
		members1[1].set("description", "a new description");

		entries1.push(
			...(
				await Promise.all(
					members1.map((member) => member.flushDirtyEntries(env.users.user1.keys)),
				)
			).flat(),
			await deletedMember1.makePermanentDeleteEntry(env.users.user1.keys),
		);

		members2 = [
			new Member(env.users.user2.keys.publicKey, {
				name: "Claire",
				pronouns: "they/them",
				description: "someone else somewhere else",
				createdAt: getDate(),
			}),
		];

		members2[0].set("pronouns", "rad/af");

		entries2.push(
			...(
				await Promise.all(
					members2.map((member) => member.flushDirtyEntries(env.users.user2.keys)),
				)
			).flat(),
		);

		const valuesToInsert = [...entries1, ...entries2]
			.map(
				(entry): EntryCreate => ({
					subspaceId: entry.subspaceId,
					path: entry.path,
					timestamp: UInt64.toInt64(entry.timestamp),
					payloadLength: UInt64.toInt64(entry.payloadLength),
					payloadDigest: entry.payloadDigest,
					payload: entry.payload !== undefined ? entry.payload : null,
					authorisationToken: AuthorisationToken.encodeAuthorisationTokenEntryRelative(
						entry.entry.authorisationToken,
						entry.entry,
					),
				}),
			)
			.map((entry) => ({
				...entry,
				path: byteStringArrayToPostgresByteaArrayLiteral(entry.path),
			}));

		assert.strictEqual(valuesToInsert.length, 3 * 5 + 1);
		const inserted = await env.db.insert(entries).values(valuesToInsert).returning();
		assert.strictEqual(inserted.length, 3 * 5 + 1);
	});

	test("GET 404", async () => {
		await env.request.get(pullEndpoint).expect(404).execute();
	});

	test("PUT 404", async () => {
		await env.request.put(pullEndpoint).send({}).expect(404).execute();
	});

	test("PATCH 404", async () => {
		await env.request.patch(pullEndpoint).send({}).expect(404).execute();
	});

	test("DELETE 404", async () => {
		await env.request.delete(pullEndpoint).send({}).expect(404).execute();
	});

	describe("POST", () => {
		test("empty request body 400", async () => {
			const response = await env.request
				.post(pullEndpoint)
				.send({})
				.authenticated(env.users.user1)
				.expect(400)
				.json();
			assert.strictEqual(response.body["entries"], undefined);
		});

		async function callPullAndGetEntries(
			timestamp: string,
			user: UserAuthData & {
				keys: {
					publicKey: UserPublicKey;
				};
			},
			expectCode: number,
		) {
			const date = new Date();
			const result = await getSyncFrom(timestamp, user, expectCode);
			assert(result.timestamp);
			assert(result.entries);
			const responseTimestamp = new Date(result.timestamp).getTime();
			assert.strictEqual(Number.isFinite(responseTimestamp), true);
			assert(Math.abs((responseTimestamp - date.getTime()) / 1000) < 0.5);

			return result.entries;
		}

		test("initial sync 200", async () => {
			const entries = await callPullAndGetEntries("", env.users.user1, 200);

			assert.strictEqual(entries.length, entries1.length);
			assert.strictEqual(entries.length, 2 * 5 + 1);
			for (const actualEntry of entries) {
				assert.strictEqual(
					entries.filter((entry) => Path.equals(entry.path, actualEntry.path)).length,
					1,
				);
				const expectedEntry = entries1.findLast((entry) =>
					Path.equals(entry.path, actualEntry.path),
				)?.entryWithPayload;
				assert.deepStrictEqual(actualEntry, expectedEntry);
			}
		});

		test("serves all entries after timestamp 200", async () => {
			const date = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10 hours ago

			const entries = await callPullAndGetEntries(date.toISOString(), env.users.user1, 200);

			assert.strictEqual(entries.length, entries1.length);
			assert.strictEqual(entries.length, 2 * 5 + 1);
			for (const actualEntry of entries) {
				const expectedEntry = entries1.findLast((entry) =>
					Path.equals(entry.path, actualEntry.path),
				)?.entryWithPayload;
				assert(expectedEntry);
				assert.deepStrictEqual(actualEntry, expectedEntry);
			}
		});

		test("accepts timestamp at j2000 epoch 200", async () => {
			await getSyncFrom(
				new Date(Number(Timestamp.J2000_TO_UNIX_DIFFERENCE / 1000n)).toISOString(),
				env.users.user1,
				200,
			);
		});

		test("refuses timestamp older than j2000 epoch 400", async () => {
			await getSyncFrom(
				new Date(Number(Timestamp.J2000_TO_UNIX_DIFFERENCE / 1000n - 1n)).toISOString(),
				env.users.user1,
				400,
			);
		});

		test("refuses timestamp in the future 400", async () => {
			await getSyncFrom(
				new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
				env.users.user1,
				400,
			);
		});

		test("refuses invalid timestamp 400", async () => {
			await getSyncFrom("this is not a valid timestamp", env.users.user1, 400);
		});
	});

	describe("POST capabilities", () => {
		let testEntries: AuthorisedEntryWithPayload[];
		let user3: TestEnvUser;
		before(async () => {
			user3 = await createAndLoginUser(env);
			async function makeEntry(path: Path, timestamp: Timestamp = Timestamp.now()) {
				const payload = ByteString.fromUtf8(createId().substring(0, Math.random() * 24));
				return AuthorisedEntryWithPayload.create(
					OPENSELVES_NAMESPACE_ID,
					user3.keys.publicKey,
					path,
					timestamp,
					payload,
					user3.keys,
				);
			}
			testEntries = [
				await makeEntry(Path.fromString("/1"), 50n),
				await makeEntry(Path.fromString("/2"), 100n),
				await makeEntry(Path.fromString("/3"), 150n),
				await makeEntry(Path.fromString("/4"), 200n),
				await makeEntry(Path.fromString("/5"), 250n),
				await makeEntry(Path.fromString("/members/abc/1")),
				await makeEntry(Path.fromString("/members/abc/2")),
				await makeEntry(Path.fromString("/members/def/1")),
				await makeEntry(Path.fromString("/members/def/2")),
				await makeEntry(Path.fromString("/fronts/abc/1")),
				await makeEntry(Path.fromString("/fronts/abc/2")),
				await makeEntry(Path.fromString("/other-things")),
			];
			await putEntries(env, testEntries);
			await checkEntriesAreServed(env, testEntries, user3);
		});

		const testCases: {
			test: string;
			status: number;
			expectEntryCount?: () => number | null;
			getCapabilities(this: void): Promise<Capability[]> | Capability[];
		}[] = [
			{
				test: "Control: valid read capability",
				status: 200,
				expectEntryCount: () => null,
				getCapabilities(this: void) {
					return [
						Capability.create(
							CapabilityAccessMode.READ,
							OPENSELVES_NAMESPACE_ID,
							env.users.user1.keys.publicKey,
							[],
						),
					];
				},
			},
			{
				test: "rejects wrong receiver",
				status: 403,
				getCapabilities(this: void) {
					return [
						Capability.create(
							CapabilityAccessMode.READ,
							OPENSELVES_NAMESPACE_ID,
							env.users.user2.keys.publicKey,
							[],
						),
					];
				},
			},
			{
				test: "rejects write capability",
				status: 400,
				getCapabilities(this: void) {
					return [
						Capability.create(
							CapabilityAccessMode.WRITE,
							OPENSELVES_NAMESPACE_ID,
							env.users.user1.keys.publicKey,
							[],
						),
					];
				},
			},
			{
				test: "rejects wrong namespaceKey",
				status: 400,
				async getCapabilities(this: void) {
					const otherCommunalNamespace =
						await NamespaceId.generateRandomCommunalNamespaceKeys();
					return [
						Capability.create(
							CapabilityAccessMode.WRITE,
							otherCommunalNamespace.publicKey,
							env.users.user1.keys.publicKey,
							[],
						),
					];
				},
			},
			{
				test: "valid delegation",
				status: 200,
				expectEntryCount: () => testEntries.length,
				async getCapabilities(this: void) {
					return [
						await Capability.delegateCapability(
							CapabilityAccessMode.READ,
							OPENSELVES_NAMESPACE_ID,
							user3.keys.publicKey,
							user3.keys,
							env.users.user1.keys.publicKey,
						),
					];
				},
			},
			{
				test: "forged by receiver",
				status: 400,
				async getCapabilities(this: void) {
					return [
						await Capability.delegateCapability(
							CapabilityAccessMode.READ,
							OPENSELVES_NAMESPACE_ID,
							env.users.user2.keys.publicKey,
							env.users.user1.keys,
							env.users.user1.keys.publicKey,
							undefined,
							true,
						),
					];
				},
			},
			{
				test: "area restricted to a path",
				status: 200,
				expectEntryCount: () => 4,
				async getCapabilities(this: void) {
					return [
						await Capability.delegateCapability(
							CapabilityAccessMode.READ,
							OPENSELVES_NAMESPACE_ID,
							user3.keys.publicKey,
							user3.keys,
							env.users.user1.keys.publicKey,
							{
								subspaceId: user3.keys.publicKey,
								path: Path.fromString("/members"),
								times: {
									start: 0n,
									end: undefined,
								},
							},
							true,
						),
					];
				},
			},
			{
				test: "area restricted to a time frame",
				status: 200,
				expectEntryCount: () => 2,
				async getCapabilities(this: void) {
					return [
						await Capability.delegateCapability(
							CapabilityAccessMode.READ,
							OPENSELVES_NAMESPACE_ID,
							user3.keys.publicKey,
							user3.keys,
							env.users.user1.keys.publicKey,
							{
								subspaceId: user3.keys.publicKey,
								path: Path.EMPTY,
								times: {
									start: 100n,
									end: 200n,
								},
							},
							true,
						),
					];
				},
			},
		];

		for (const { test: testName, getCapabilities, status, expectEntryCount } of testCases) {
			test(`pull read capabilities: ${testName} ${status}`, async () => {
				const capabilities = await getCapabilities();
				const builder = env.request
					.post("/sync/pull")
					.authenticated(env.users.user1)
					.accept("application/octet-stream", status === 200)
					.send({
						timestamp: "",
						capabilities: capabilities.map((capability) =>
							Capability.encode(capability).toBase64(),
						),
					})
					.expect(status);
				if (status !== 200) {
					assert.strictEqual(expectEntryCount, undefined);
					await builder
						.expectNotCookie("refreshToken")
						.expectNotCookie("accessToken")
						.json();
				} else {
					assert(expectEntryCount);
					assert(
						(
							await Promise.all(capabilities.map((cap) => Capability.isValid(cap)))
						).every((val) => val),
					);

					const response = await builder.execute();
					assert(response.body);

					const entries: AuthorisedEntryWithPayload[] = await readStream(
						response.body.pipeThrough(await Drop.decoder()),
					);

					const expectedCount = expectEntryCount();
					if (expectedCount !== null) {
						assert.strictEqual(entries.length, expectedCount);
					}

					for (const entry of entries) {
						const matchedCapability = capabilities.find(
							(cap) =>
								NamespaceId.equals(
									entry.namespaceId,
									Capability.getGrantedNamespace(cap),
								) && Area.includesEntry(Capability.getGrantedArea(cap), entry),
						);

						assert(matchedCapability);
					}
				}
			});
		}
	});
});
