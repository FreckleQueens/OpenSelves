import * as fs from "node:fs";
import assert from "node:assert";
import { Member } from "openselves-common/client";
import { ByteString, Drop, type EntryWithPayload, SubspaceId } from "openselves-common/willow";

import type { UserAuthData } from "./TestQueryBuilder.js";
import type { TestEnvWithUsers } from "./utils.js";

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
	entry: EntryWithPayload,
	expectCode: number = 200,
	user: UserAuthData = env.users.user1,
) {
	return putEntries(env, [entry], expectCode, user);
}

export async function putEntries(
	env: TestEnvWithUsers,
	entries: EntryWithPayload[],
	expectCode: number = 200,
	user: UserAuthData = env.users.user1,
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
	subspaceId: ByteString = env.users.user1.keys.publicKey,
	user: UserAuthData = env.users.user1,
	expectStatus: number = 200,
): Promise<{
	response: Response;
	timestamp?: string;
	entries?: EntryWithPayload[];
}> {
	const response = await env.request
		.post(pullEndpoint)
		.authenticated(user)
		.accept("application/octet-stream", expectStatus === 200)
		.send({
			timestamp: timestamp,
			subspaceId: subspaceId.toBase64(),
		})
		.expect(expectStatus)
		.execute();

	if (expectStatus !== 200) {
		return {
			response,
		};
	}

	const responseTimestamp = response.headers.get("X-OpenSelves-Pull-Timestamp");

	assert(typeof responseTimestamp === "string");

	assert(response.body);
	const readable = response.body.pipeThrough(Drop.decoder());
	const entries: EntryWithPayload[] = [];

	const reader = readable.getReader();
	while (true) {
		const result = await reader.read();
		if (result.value) {
			entries.push(result.value);
		}
		if (result.done) {
			break;
		}
	}

	return {
		response,
		timestamp: responseTimestamp,
		entries,
	};
}
