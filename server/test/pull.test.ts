import assert from "node:assert";
import test, { before, describe } from "node:test";
import { Member } from "openselves-common/client";
import {
	ByteString,
	EntryWrapper,
	Path,
	type SubspaceId,
	Timestamp,
	UInt64,
} from "openselves-common/willow";

import { type EntryCreate, entries, pathToPostgresByteaLiteral } from "../src/db/index.js";
import type { UserAuthData } from "./TestQueryBuilder.js";
import { getSyncFrom as originalGetSyncFrom } from "./sync-utils.js";
import { type TestEnvWithUsers, setupTestSuiteWithUsers } from "./utils.js";

const pullEndpoint = "/sync/pull";

// TODO: test request timeout (no consumption in 60s? force close)

describe("/sync/pull", () => {
	let env: TestEnvWithUsers;

	const getSyncFrom = (
		timestamp: string,
		subspaceId: ByteString = env.users.user1.keys.publicKey,
		user: UserAuthData = env.users.user1,
		expectStatus: number,
	) => originalGetSyncFrom(env, timestamp, subspaceId, user, expectStatus);

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
			...(await Promise.all(members1.map((member) => member.flushDirtyEntries()))).flat(),
			await deletedMember1.makePermanentDeleteEntry(),
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
			...(await Promise.all(members2.map((member) => member.flushDirtyEntries()))).flat(),
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
				}),
			)
			.map((entry) => ({
				...entry,
				path: pathToPostgresByteaLiteral(entry.path),
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
			subspaceId: SubspaceId,
			user: UserAuthData,
			expectCode: number,
		) {
			const date = new Date();
			const result = await getSyncFrom(timestamp, subspaceId, user, expectCode);
			assert(result.timestamp);
			assert(result.entries);
			const responseTimestamp = new Date(result.timestamp).getTime();
			assert.strictEqual(Number.isFinite(responseTimestamp), true);
			assert(Math.abs((responseTimestamp - date.getTime()) / 1000) < 0.5);

			return result.entries;
		}

		test("initial sync 200", async () => {
			const entries = await callPullAndGetEntries(
				"",
				env.users.user1.keys.publicKey,
				env.users.user1,
				200,
			);

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

			const entries = await callPullAndGetEntries(
				date.toISOString(),
				env.users.user1.keys.publicKey,
				env.users.user1,
				200,
			);

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
				env.users.user1.keys.publicKey,
				env.users.user1,
				200,
			);
		});

		test("refuses timestamp older than j2000 epoch 400", async () => {
			await getSyncFrom(
				new Date(Number(Timestamp.J2000_TO_UNIX_DIFFERENCE / 1000n - 1n)).toISOString(),
				env.users.user1.keys.publicKey,
				env.users.user1,
				400,
			);
		});

		test("refuses timestamp in the future 400", async () => {
			await getSyncFrom(
				new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
				env.users.user1.keys.publicKey,
				env.users.user1,
				400,
			);
		});

		test("refuses invalid timestamp 400", async () => {
			await getSyncFrom(
				"this is not a valid timestamp",
				env.users.user1.keys.publicKey,
				env.users.user1,
				400,
			);
		});
	});
});
