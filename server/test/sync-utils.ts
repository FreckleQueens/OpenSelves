import * as fs from "node:fs";
import assert from "node:assert";
import { Member } from "openselves-common/client";
import {
	type Entry,
	EntryWrapper,
	isEntry,
	toJsonFriendlyMaybeWithPayload,
} from "openselves-common/willow";

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
	entry: Entry | EntryWrapper | Record<string, unknown>,
	expectCode: number = 200,
	cookies: string = env.users.cookies,
	processEntryObjects: boolean = true,
) {
	return putEntries(env, [entry], expectCode, cookies, processEntryObjects);
}

export async function putEntries(
	env: TestEnvWithUsers,
	entries: (Entry | EntryWrapper | Record<string, unknown>)[],
	expectCode: number = 200,
	cookies: string = env.users.cookies,
	processEntryObjects: boolean = true,
) {
	let entriesToSend: Record<string, unknown>[];
	if (processEntryObjects) {
		entriesToSend = entries.map((entry) => {
			const entryToProcess =
				entry instanceof EntryWrapper ? entry.entryMaybeWithPayload : entry;
			assert(isEntry(entryToProcess));
			return {
				...toJsonFriendlyMaybeWithPayload(entryToProcess),
			};
		});
	} else {
		entriesToSend = [
			...entries.map((entry) => {
				assert(!(entry instanceof EntryWrapper));
				return { ...entry };
			}),
		];
	}

	const request = env.request.put(pushEndpoint).set("Cookie", cookies).send({
		entries: entriesToSend,
	});
	const response = await request.expect("Content-Type", /json/);
	if (response.statusCode !== expectCode) {
		console.error(response.body);
	}
	assert.strictEqual(response.statusCode, expectCode);
	return response;
}

export function readFile(filePath: string) {
	return fs.readFileSync(filePath).toString();
}

export function makeMember(
	userId: string,
	date: Date = new Date(),
	image: string | FileRef | null = null,
	minimal: boolean = false,
) {
	const member: Member = new Member(userId, {
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
