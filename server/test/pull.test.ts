import assert from "node:assert";
import test, { before, describe } from "node:test";
import { Member } from "openselves-common/client";
import { type EntryCreate, entries } from "openselves-common/db";
import { EntryWrapper, J2000_TO_UNIX_DIFFERENCE, uint64ToInt64 } from "openselves-common/willow";

import type { UserAuthData } from "./TestQueryBuilder.js";
import { type TestEnvWithUsers, setupTestSuiteWithUsers } from "./utils.js";

const pullEndpoint = "/sync/pull";

describe("/sync/pull", () => {
	let env: TestEnvWithUsers;
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
			new Member(env.users.user1.api.id, {
				name: "Alice",
				pronouns: "she/her",
				description: "a member of our& system",
				createdAt: getDate(),
			}),
			new Member(env.users.user1.api.id, {
				name: "Bob",
				pronouns: "he/him",
				description: "another member of our& system",
				createdAt: getDate(),
			}),
		];

		deletedMember1 = new Member(env.users.user1.api.id, {
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
			new Member(env.users.user2.api.id, {
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

		const valuesToInsert = [...entries1, ...entries2].map(
			(entry): EntryCreate => ({
				subspaceId: entry.subspaceId,
				path: entry.path,
				timestamp: uint64ToInt64(entry.timestamp),
				payloadLength: uint64ToInt64(entry.payloadLength),
				payloadDigest: entry.payloadDigest,
				payload: typeof entry.payload === "string" ? Buffer.from(entry.payload) : null,
			}),
		);

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

		async function callPull(timestamp: string, expectCode: number, user: UserAuthData) {
			return await env.request
				.post(pullEndpoint)
				.authenticated(user)
				.send({
					timestamp: timestamp,
				})
				.expect(expectCode)
				.json();
		}

		async function callPullAndGetEntries(
			timestamp: string,
			expectCode: number,
			user: UserAuthData,
		) {
			const date = new Date();
			const response = await callPull(timestamp, expectCode, user);
			const responseTimestamp = new Date(response.body["timestamp"]).getTime();
			assert.strictEqual(Number.isFinite(responseTimestamp), true);
			assert(Math.abs((responseTimestamp - date.getTime()) / 1000) < 0.5);

			const entries: unknown[] = response.body["entries"];
			assert.notStrictEqual(entries, undefined);
			assert(Array.isArray(entries));
			return await Promise.all(
				entries.map((entry) => {
					return EntryWrapper.load(entry);
				}),
			);
		}

		test("initial sync 200", async () => {
			const entries = await callPullAndGetEntries("", 200, env.users.user1);

			assert.strictEqual(entries.length, entries1.length);
			assert.strictEqual(entries.length, 2 * 5 + 1);
			for (const actualEntry of entries) {
				assert.strictEqual(
					entries.filter((entry) => entry.path === actualEntry.path).length,
					1,
				);
				const expectedEntry = entries1.findLast((entry) => entry.path === actualEntry.path);
				assert.deepStrictEqual(actualEntry, expectedEntry);
			}
		});

		test("serves all entries after timestamp 200", async () => {
			const date = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10 hours ago

			const entries = await callPullAndGetEntries(date.toISOString(), 200, env.users.user1);

			assert.strictEqual(entries.length, entries1.length);
			assert.strictEqual(entries.length, 2 * 5 + 1);
			for (const actualEntry of entries) {
				const expectedEntry = entries1.findLast((entry) => entry.path === actualEntry.path);
				assert(expectedEntry);
				assert.deepStrictEqual(actualEntry, expectedEntry);
			}
		});

		test("accepts timestamp at j2000 epoch 200", async () => {
			await callPull(
				new Date(Number(J2000_TO_UNIX_DIFFERENCE / 1000n)).toISOString(),
				200,
				env.users.user1,
			);
		});

		test("refuses timestamp older than j2000 epoch 400", async () => {
			const response = await callPull(
				new Date(Number(J2000_TO_UNIX_DIFFERENCE / 1000n - 1n)).toISOString(),
				400,
				env.users.user1,
			);
			assert.strictEqual(response.body["timestamp"], undefined);
			assert.strictEqual(response.body["entries"], undefined);
		});

		test("refuses timestamp in the future 400", async () => {
			const response = await callPull(
				new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
				400,
				env.users.user1,
			);
			assert.strictEqual(response.body["timestamp"], undefined);
			assert.strictEqual(response.body["entries"], undefined);
		});

		test("refuses invalid timestamp 400", async () => {
			const response = await callPull("this is not a valid timestamp", 400, env.users.user1);
			assert.strictEqual(response.body["timestamp"], undefined);
			assert.strictEqual(response.body["entries"], undefined);
		});
	});
});
