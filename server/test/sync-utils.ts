import * as fs from "node:fs";
import assert from "node:assert";
import { readStream } from "openselves-common";
import { Member } from "openselves-common/client";
import {
	AuthorisedEntryWithPayload,
	Capability,
	CapabilityAccessMode,
	Drop,
	OPENSELVES_NAMESPACE_ID,
	Path,
	type SubspaceId,
	UserPublicKey,
} from "openselves-common/willow";

import type { UserAuthData } from "./TestQueryBuilder.js";
import type { TestEnvUser, TestEnvWithUsers } from "./utils.js";

export const pushEndpoint = "/sync/push";
export const pullEndpoint = "/sync/pull";

export const TEST_IMAGE_DATA_URL =
	"data:image/png;base64," + fs.readFileSync("test/test_image_32x32.png").toString("base64");
export const LARGE_IMAGE_FILE_PATH = "test/test_image_512x512.png";
export const LARGE_IMAGE_CONTENT = fs.readFileSync(LARGE_IMAGE_FILE_PATH);
export const TEST_IMAGE_LONG_DATA_URL =
	"data:image/png;base64," + LARGE_IMAGE_CONTENT.toString("base64");

export type FileRef = { filePath: string };

export async function putEntry(
	env: TestEnvWithUsers,
	entry: AuthorisedEntryWithPayload,
	expectCode: number = 200,
	user: TestEnvUser = env.users.user1,
) {
	return putEntries(env, [entry], expectCode, user);
}

export async function putEntries(
	env: TestEnvWithUsers,
	entries: AuthorisedEntryWithPayload[],
	expectCode: number = 200,
	user: TestEnvUser = env.users.user1,
) {
	const encoder = Drop.encoder();

	const requestPromise = env.request
		.put(pushEndpoint)
		.authenticated(user)
		.uploadStream(encoder.readable)
		.expect(expectCode)
		.json();

	const writer = encoder.writable.getWriter();
	for (const entry of entries) {
		await writer.write(entry);
	}
	await writer.close();

	return requestPromise;
}

export function readFile(filePath: string) {
	return fs.readFileSync(filePath).toString();
}

export function makeMember(
	subspaceId: SubspaceId,
	date: Date = new Date(),
	image: string | FileRef | null = null,
	minimal: boolean = false,
) {
	const member: Member = new Member(subspaceId, {
		name: "Alice",
		pronouns: "she/her",
		description: "a member of our& system",
		createdAt: date,
		isArchived: false,
	});
	if (!minimal) {
		member.assign({
			color: "#123abc",
			archivedReason: "An old archival reason",
		});
	}

	if (image && (typeof image !== "string" || !minimal)) {
		member.set("image", typeof image === "string" ? image : readFile(image.filePath));
	}

	return { member, date };
}

export async function getSyncFrom(
	env: TestEnvWithUsers,
	timestamp: string,
	user: UserAuthData & {
		keys: {
			publicKey: UserPublicKey;
		};
	} = env.users.user1,
	expectStatus: number = 200,
): Promise<{
	response: {
		headers: Headers;
		body: object | Response["body"];
	};
	timestamp?: string;
	entries?: AuthorisedEntryWithPayload[];
}> {
	const query = env.request
		.post(pullEndpoint)
		.authenticated(user)
		.accept("application/octet-stream", expectStatus === 200)
		.send({
			timestamp: timestamp,
			capabilities: [
				Capability.encode(
					Capability.create(
						CapabilityAccessMode.READ,
						OPENSELVES_NAMESPACE_ID,
						user.keys.publicKey,
						[],
					),
				).toBase64(),
			],
		})
		.expect(expectStatus);
	const response = expectStatus === 200 ? await query.execute() : await query.json();

	if (expectStatus !== 200) {
		return {
			response,
		};
	}

	assert(response.body instanceof ReadableStream);

	const responseTimestamp = response.headers.get("X-OpenSelves-Pull-Timestamp");

	assert(typeof responseTimestamp === "string");

	assert(response.body);
	const entries: AuthorisedEntryWithPayload[] = await readStream(
		response.body.pipeThrough(await Drop.decoder()),
	);

	for (const entry of entries) {
		assert(await AuthorisedEntryWithPayload.isValid(entry));
	}

	return {
		response,
		timestamp: responseTimestamp,
		entries,
	};
}

export async function checkEntriesAreServed(
	env: TestEnvWithUsers,
	expectedEntries: AuthorisedEntryWithPayload[],
	user: UserAuthData & {
		keys: {
			publicKey: UserPublicKey;
		};
	} = env.users.user1,
) {
	assert(expectedEntries.length > 0);

	const response = await getSyncFrom(env, "", user);

	assert(response.entries);
	assert(response.entries.length > 0);

	const actualEntries = response.entries;
	for (const expectedEntry of expectedEntries) {
		const actualEntry = actualEntries.find((entry) =>
			Path.equals(entry.path, expectedEntry.path),
		);
		assert(actualEntry);
		assert.deepStrictEqual(actualEntry, expectedEntry);
	}
}

export async function checkEntriesAreNotServed(
	env: TestEnvWithUsers,
	entries: AuthorisedEntryWithPayload[],
	user: UserAuthData & {
		keys: {
			publicKey: UserPublicKey;
		};
	} = env.users.user1,
) {
	const response = await getSyncFrom(env, "", user);
	assert(response.entries);

	const actualEntries = response.entries;
	for (const expectedEntry of entries) {
		for (const actualEntry of actualEntries) {
			assert.notDeepStrictEqual(actualEntry, expectedEntry);
		}
	}
}
