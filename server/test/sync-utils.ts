import * as fs from "node:fs";
import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import { createReadStream } from "node:fs";
import type { Log, MemberCreate } from "openselves-common/db";

import type { TestEnv, TestEnvWithUsers } from "./utils.js";

export const pushEndpoint = "/sync/push";
export const pullEndpoint = "/sync/pull";

export type ClientAttachment = {
	path: string;
};

export type ClientLogWithPushedAt = Omit<Log, "userId" | "deletedId" | "memberId" | "frontId"> & {
	memberId?: string;
	frontId?: string;
};
export type ClientLog = Omit<ClientLogWithPushedAt, "pushedAt"> & {
	attachments?: (FileToUpload & {
		fieldName: "attachments[]";
	})[];
};

export type FileToUpload = {
	fieldName: string;
	name: string;
	path: string;
	contentType?: string;
};

export const TEST_IMAGE_DATA_URL =
	"data:image/png;base64," + fs.readFileSync("test/test_image_32x32.png").toString("base64");
export const LARGE_IMAGE_FILE_PATH = "test/test_image_512x512.png";
export const LARGE_IMAGE_CONTENT = fs.readFileSync(LARGE_IMAGE_FILE_PATH);
export const TEST_IMAGE_LONG_DATA_URL =
	"data:image/png;base64," + LARGE_IMAGE_CONTENT.toString("base64");

export async function putLog(
	env: TestEnvWithUsers,
	log: ClientLog,
	expectCode: number = 200,
	cookies: string = env.users.cookies,
) {
	return putLogs(env, [log], expectCode, cookies);
}

export async function putLogs(
	env: TestEnvWithUsers,
	logs: ClientLog[],
	expectCode: number = 200,
	cookies: string = env.users.cookies,
) {
	const files: FileToUpload[] = logs.map((log) => log.attachments || []).flat();

	let request = env.request.put(pushEndpoint).set("Cookie", cookies);
	if (files.length > 0) {
		request = request.field("logs", JSON.stringify(logs));
		for (const file of files) {
			request = request.attach(file.fieldName, createReadStream(file.path), {
				filename: file.name,
				contentType: file.contentType,
			});
		}
	} else {
		request = request.send({
			logs: logs,
		});
	}
	const response = await request.expect("Content-Type", /json/);
	if (response.statusCode !== expectCode) {
		console.error(response.body);
	}
	assert.strictEqual(response.statusCode, expectCode);
	return response;
}

export function getLogAttachmentUrl(env: TestEnv, userId: string, log: ClientLog, dataKey: string) {
	const publicUrl = env.configService.getOrThrow("PUBLIC_URL", { infer: true });
	return {
		absolute: `${publicUrl}/attachment/${userId}/${log.id}/${dataKey}`,
		relative: `/attachment/${userId}/${log.id}/${dataKey}`,
	};
}

export function attachFileToLog(attachment: ClientAttachment, log: ClientLog, dataKey: string) {
	if (!log.data || typeof log.data !== "object" || !(dataKey in log.data)) {
		throw new Error("Wrong log.data for key " + dataKey, { cause: log.data });
	}

	const attachmentId = createId();
	log.data[dataKey] = "attachment:" + attachmentId;
	if (!log.attachments) {
		log.attachments = [];
	}
	log.attachments.push({
		fieldName: "attachments[]",
		name: attachmentId,
		path: attachment.path,
	});
}

export function makeMemberWithLog(
	date: Date = new Date(),
	image: string | ClientAttachment | null = null,
	minimal: boolean = false,
) {
	const member: Omit<MemberCreate, "userId" | "id"> = {
		name: "Alice",
		pronouns: "she/her",
		description: "a member of our& system",
		createdAt: date,
		updatedAt: date,
	};
	if (!minimal) {
		member.color = "#123abc";
		member.image = typeof image === "string" ? image : null;
		member.isArchived = false;
		member.archivedReason = null;
	}
	const createLog: ClientLog & {
		memberId: string;
	} = {
		id: createId(),
		memberId: createId(),
		operationType: "create",
		data: member,
		executedAt: date,
	};

	if (image && typeof image !== "string") {
		attachFileToLog(image, createLog, "image");
	}

	return { member, createLog, date };
}
