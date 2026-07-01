import { type GetObjectCommandOutput, NoSuchKey } from "@aws-sdk/client-s3";
import { confirm } from "@inquirer/prompts";
import assert from "node:assert";
import {
	type BaseSchema,
	type EntryDataModel,
	Front,
	FrontSchema,
	Member,
	MemberSchema,
	type Schema,
	isFieldValueValid,
	serializeValueToPayload,
} from "openselves-common/client";
import { entries, fronts, logs, members } from "openselves-common/db";
import {
	type EntryWithPayload,
	EntryWrapper,
	MAX_UINT64,
	OPENSELVES_NAMESPACE_ID,
	Store,
	hashPayload,
	int64toUint64,
	isEntryWithPayload,
	unixMillisecondsToJ2000Microseconds,
} from "openselves-common/willow";

import { AppCommand } from "../../AppCommand.js";
import { DB } from "../../db/drizzle.js";
import type { PushEntryDto } from "../data/push.dto.js";
import { S3Service } from "../s3.service.js";
import { SyncService } from "../sync.service.js";

export const MIGRATE_TO_WILLOW_COMMAND = new AppCommand("migrate-to-willow");
MIGRATE_TO_WILLOW_COMMAND.description("Migrates fronts, members and logs into entries").action(
	async function () {
		const { app } = this.getContext();
		const db = app.get(DB);
		const syncService = app.get(SyncService);
		const s3Service = app.get(S3Service);
		try {
			await migrateToWillowCommand(db, syncService, s3Service);
		} catch (e) {
			console.error(e);
			this.error("An error occurred while running the migration.", {
				exitCode: 1,
			});
		}
	},
);

async function migrateToWillowCommand(db: DB, syncService: SyncService, s3Service: S3Service) {
	console.warn(
		"This command is intended to run on a database that is CURRENTLY *NOT* BEING USED. Please make sure you stop any running OpenSelves shard before proceeding.",
	);
	let continueAnswer = await confirm({
		message: "Continue?",
		default: false,
	});

	if (!continueAnswer) {
		return;
	}

	console.log("Gathering data...");
	const allEntriesBeforeMigrations = await db.select().from(entries);
	if (allEntriesBeforeMigrations.length > 0) {
		const answer = await confirm({
			message:
				"There are already some entries in the DB. This most likely means this command was already run. Run it anyway?",
			default: false,
		});

		if (!answer) {
			return;
		}
	}

	const allLogs = await db.select().from(logs);
	const allMembers = await db.select().from(members);
	const allFronts = await db.select().from(fronts);
	console.log(
		">",
		allLogs.length,
		"logs;",
		allMembers.length,
		"members;",
		allFronts.length,
		"fronts; to migrate",
	);

	const answer = await confirm({
		message: "Attempt migration?",
		default: false,
	});
	if (!answer) {
		return;
	}

	function getLogAttachmentKey(userId: string, logId: string, dataKey: string) {
		return userId + "/" + logId + "/" + dataKey;
	}

	// Preload images from s3
	console.log("Downloading images from s3...");
	const preloadedImages = Object.fromEntries(
		await Promise.all(
			allLogs
				.filter(
					(log) =>
						(log.operationType === "create" || log.operationType === "update") &&
						log.memberId &&
						log.data &&
						typeof log.data === "object" &&
						typeof log.data["image"] === "string",
				)
				.map(async (log): Promise<[string, string]> => {
					const key = getLogAttachmentKey(log.userId, log.id, "image");
					let s3Output: GetObjectCommandOutput | undefined;
					try {
						s3Output = await s3Service.getObject(key);
					} catch (e) {
						if (e instanceof NoSuchKey) {
							console.warn(
								'An image referenced in a log was not found. If all images link, this is benign. ("x images found out of n message")',
							);
							return [key, ""];
						}
						throw e;
					}
					if (!s3Output?.Body) {
						throw new Error("s3 responded with no body", { cause: s3Output });
					}
					return [key, await s3Output.Body.transformToString()];
				}),
		),
	);
	const imagePayloadsByDigest = Object.fromEntries(
		await Promise.all(
			Object.values(preloadedImages).map(async (image): Promise<[string, string]> => {
				const payload = serializeValueToPayload(MemberSchema, "image", image);
				return [await hashPayload(payload), payload];
			}),
		),
	);
	console.log(
		"> Preloaded",
		Object.keys(preloadedImages).length,
		"images from s3 that resolve to",
		Object.keys(imagePayloadsByDigest).length,
		"different images",
	);

	await db.transaction(async (tx) => {
		// Convert all logs to entries
		console.log("Computing entries...");
		const convertedEntries: Promise<EntryWrapper>[] = [];
		for (const log of allLogs) {
			if (log.operationType === "create" || log.operationType === "update") {
				let prefix: string, id: string, schema: Schema;
				if (log.memberId) {
					prefix = "member";
					id = log.memberId;
					schema = MemberSchema;
				} else if (log.frontId) {
					prefix = "front";
					id = log.frontId;
					schema = FrontSchema;
				} else {
					throw new Error("Unknown operation type: " + log.operationType, {
						cause: log,
					});
				}

				// eslint-disable-next-line prefer-const
				for (let [key, value] of Object.entries(log.data as Record<string, unknown>)) {
					if (key === "updatedAt") {
						continue;
					}

					if (key === "createdAt" && typeof value === "string") {
						const newVal = new Date(value);
						if (!(newVal.getTime() > 0)) {
							throw new Error("Got invalid date");
						}
						value = newVal;
					}

					if (prefix === "member") {
						if (["color", "image", "archivedReason"].includes(key) && value === null) {
							continue;
						}

						if (
							key === "image" &&
							typeof value === "string" &&
							value.startsWith("attachment:")
						) {
							const s3Key = getLogAttachmentKey(log.userId, log.id, key);
							value = preloadedImages[s3Key];
							assert(typeof value === "string");
						}
					} else if (prefix === "front") {
						if (["startedAt", "endedAt"].includes(key) && typeof value === "string") {
							const newVal = new Date(value);
							if (!(newVal.getTime() > 0)) {
								throw new Error("Got invalid date");
							}
							value = newVal;
						}

						if (["endedAt", "note"].includes(key) && value === null) {
							continue;
						}
					}

					if (!isFieldValueValid(schema, key, value)) {
						throw new Error("Invalid key value", {
							cause: {
								key,
								value,
								schema,
							},
						});
					}

					convertedEntries.push(
						EntryWrapper.create(
							OPENSELVES_NAMESPACE_ID,
							log.userId,
							"/" + prefix + "/" + id + "/" + key,
							unixMillisecondsToJ2000Microseconds(log.executedAt.getTime()),
							serializeValueToPayload(schema, key, value),
						),
					);
				}

				if (log.operationType === "create") {
					convertedEntries.push(
						EntryWrapper.create(
							OPENSELVES_NAMESPACE_ID,
							log.userId,
							"/" + prefix + "/" + id + "/id",
							unixMillisecondsToJ2000Microseconds(log.executedAt.getTime()),
							serializeValueToPayload(schema, "id", id),
						),
					);
				}
			} else {
				assert(log.operationType === "delete");
				assert(log.deletedId);
				const [table, id] = log.deletedId.split(".", 2);
				const prefix = table === "members" ? "member" : table === "fronts" ? "front" : "";
				assert(["member", "front"].includes(prefix));
				assert(id);

				convertedEntries.push(
					EntryWrapper.create(
						OPENSELVES_NAMESPACE_ID,
						log.userId,
						"/" + prefix + "/" + id,
						MAX_UINT64,
						"",
					),
				);
			}
		}

		const computedEntries = await Promise.all(convertedEntries);
		const store = new Store<EntryWithPayload>(OPENSELVES_NAMESPACE_ID);
		store.ingest(
			...computedEntries.map((entry) => {
				const entryMaybeWithPayload = entry.entryMaybeWithPayload;
				assert(isEntryWithPayload(entryMaybeWithPayload));
				return entryMaybeWithPayload;
			}),
		);
		const entriesToVerify = await Promise.all(
			store.entries.map((dto) => EntryWrapper.load(dto)),
		);
		console.log(
			">",
			computedEntries.length,
			"Computed entries, ",
			entriesToVerify.length,
			"after prefix-pruning",
		);

		console.log("Verifying records against entries...");
		let imagesFound = 0;
		let imagesNotFound = 0;
		const pairs = [
			...allMembers.map((member) => {
				const { userId, updatedAt, color, image, archivedReason, ...rest } = member;

				let imageOutput = image;
				if (typeof image === "string" && image.startsWith("attachment:")) {
					const logId = image.split(":", 2)[1];
					const s3Key = getLogAttachmentKey(member.userId, logId, "image");
					imageOutput = preloadedImages[s3Key];
					if (typeof imageOutput === "string" && imageOutput.length > 0) {
						imagesFound++;
					} else {
						imagesNotFound++;
						console.error("A required image was not found");
					}
				}

				return {
					entries: new Member(
						member.userId,
						undefined,
						entriesToVerify.filter(
							(entry) =>
								entry.subspaceId === member.userId &&
								entry.path.startsWith("/member/" + member.id),
						),
					),
					data: new Member(member.userId, {
						...rest,
						color: color === null ? undefined : color,
						image: imageOutput === null ? undefined : imageOutput,
						archivedReason: archivedReason === null ? undefined : archivedReason,
					}),
				};
			}),
			...allFronts.map((front) => {
				const { userId, updatedAt, endedAt, note, ...rest } = front;
				return {
					entries: new Front(
						front.userId,
						undefined,
						entriesToVerify.filter(
							(entry) =>
								entry.subspaceId === front.userId &&
								entry.path.startsWith("/front/" + front.id),
						),
					),
					data: new Front(front.userId, {
						...rest,
						endedAt: endedAt === null ? undefined : endedAt,
						note: note === null ? undefined : note,
					}),
				};
			}),
		];
		console.log(">", imagesFound, "images found out of", imagesFound + imagesNotFound);
		continueAnswer = await confirm({
			message: "Continue to verifying data?",
			default: false,
		});
		if (!continueAnswer) {
			tx.rollback();
			return;
		}

		const entryPairs = await Promise.all(
			pairs.map(async (pair) => ({
				entries: Object.values(await pair.entries.computeEntries())
					.map((entry) => entry.entryMaybeWithPayload)
					.map((entry) => {
						const { timestamp, ...rest } = entry;
						return rest;
					}),
				data: (await pair.data.flushDirtyEntries())
					.map((entry) => entry.entryMaybeWithPayload)
					.map((entry) => {
						const { timestamp, ...rest } = entry;
						return rest;
					}),
			})),
		);

		const comparePathFn = (a: { path: string }, b: { path: string }) =>
			a.path > b.path ? 1 : a.path < b.path ? -1 : 0;
		let differingEntries = 0;
		for (const { entries, data } of entryPairs) {
			const providedEntries = entries.sort(comparePathFn);
			const inDbData = data.sort(comparePathFn);
			assert.deepStrictEqual(
				providedEntries.map((entry) => entry.path),
				inDbData.map((entry) => entry.path),
			);
			for (let i = 0; i < providedEntries.length; i++) {
				const providedEntry = {
					...providedEntries[i],
					payloadLength: providedEntries[i].payloadLength.toString(),
				};
				const inDbDatum = {
					...inDbData[i],
					payloadLength: inDbData[i].payloadLength.toString(),
				};
				if (JSON.stringify(providedEntry) !== JSON.stringify(inDbDatum)) {
					differingEntries++;
					console.log(
						"/!\\ will save:",
						providedEntry.path,
						providedEntry.payloadLength,
						"which is different from what was found directly in record:",
						inDbDatum.path,
						inDbDatum.payloadLength,
					);
				}
			}
		}

		console.log(
			"> Out of",
			convertedEntries.length,
			"generated entries,",
			differingEntries,
			"differ from in-db data.",
		);
		continueAnswer = await confirm({
			message: "Continue to ingesting entries?",
			default: false,
		});
		if (!continueAnswer) {
			tx.rollback();
			return;
		}

		console.log("Ingesting entries...");
		const userDtos: Record<string, PushEntryDto[]> = {};
		for (const entry of computedEntries) {
			if (!userDtos[entry.entry.subspaceId]) {
				userDtos[entry.entry.subspaceId] = [];
			}
			const entryData = entry.entryMaybeWithPayload;
			assert(isEntryWithPayload(entryData));
			userDtos[entry.entry.subspaceId].push(entryData);
		}

		let ingestedEntries = 0;
		for (const [userId, dtos] of Object.entries(userDtos)) {
			await syncService.ingestEntries(userId, dtos);
			ingestedEntries += dtos.length;
		}
		console.log(
			"Ingested",
			ingestedEntries,
			"out of the",
			computedEntries.length,
			"computed entries",
		);

		const allEntries = await tx.select().from(entries);
		console.log("> There are now", allEntries.length, "in DB");

		// Verify in-db data
		console.log("Verifying in-DB data...");
		const modelEntries: Record<"fronts" | "members", Record<string, EntryWrapper[]>> = {
			fronts: {},
			members: {},
		};
		for (const entry of allEntries) {
			const [prefix, id] = entry.path.substring(1).split("/");

			let store: Record<string, EntryWrapper[]>;
			if (prefix === "member") {
				store = modelEntries.members;
			} else if (prefix === "front") {
				store = modelEntries.fronts;
			} else {
				console.warn("Unrecognized entry model", entry);
				continue;
			}

			let payload: Buffer<ArrayBufferLike> | string | null = entry.payload;
			if (entry.payload === null && entry.payloadStorage === "s3") {
				payload = imagePayloadsByDigest[entry.payloadDigest] || null;
				if (!payload) {
					console.warn("Warning: image not found for digest", entry.payloadDigest);
					console.log(Object.keys(imagePayloadsByDigest));
				}
			}

			if (!store[id]) {
				store[id] = [];
			}

			store[id].push(
				await EntryWrapper.load(
					{
						...entry,
						namespaceId: OPENSELVES_NAMESPACE_ID,
						timestamp: int64toUint64(entry.timestamp),
						payloadLength: int64toUint64(entry.payloadLength),
					},
					payload?.toString(),
				),
			);
		}

		const models: EntryDataModel<Schema & typeof BaseSchema>[] = [];
		function loadModels(
			type: {
				new (
					id: string,
					data: undefined,
					entries: EntryWrapper[],
				): EntryDataModel<Schema & typeof BaseSchema>;
			},
			store: Record<string, EntryWrapper[]>,
		) {
			for (const [id, entries] of Object.entries(store)) {
				models.push(new type(id, undefined, entries));
			}
		}
		loadModels(Member, modelEntries.members);
		loadModels(Front, modelEntries.fronts);

		console.log("> Computed", models.length, "from DB");

		console.log("Comparing...");
		let allExpectedEntries = [...entriesToVerify];
		for (const model of models) {
			const actualEntries = Object.values(await model.computeEntries()).sort(comparePathFn);
			const expectedEntries = allExpectedEntries
				.filter((entry) => entry.path.startsWith(model.getPathRoot()))
				.sort(comparePathFn);
			allExpectedEntries = allExpectedEntries.filter(
				(entry) => !expectedEntries.includes(entry),
			);

			assert.strictEqual(actualEntries.length, expectedEntries.length);

			for (let i = 0; i < actualEntries.length; i++) {
				const actualEntry = {
					...actualEntries[i].entryMaybeWithPayload,
					timestamp: actualEntries[i].timestamp.toString(),
					payloadLength: actualEntries[i].payloadLength.toString(),
				};
				const expectedEntry = {
					...expectedEntries[i].entryMaybeWithPayload,
					timestamp: expectedEntries[i].timestamp.toString(),
					payloadLength: expectedEntries[i].payloadLength.toString(),
				};
				if (JSON.stringify(actualEntry) !== JSON.stringify(expectedEntry)) {
					differingEntries++;
					console.log("---");
					console.log("/!\\ found:");
					console.log(
						Object.keys(actualEntry),
						actualEntry.path,
						actualEntry.payloadLength,
						actualEntry.payloadDigest,
					);
					console.log("which is different from what was expected:");
					console.log(
						Object.keys(expectedEntry),
						expectedEntry.path,
						expectedEntry.payloadLength,
						expectedEntry.payloadDigest,
					);
				}
			}
		}
		console.log(">", allExpectedEntries.length, "orphan entries remaining");
		console.log("Done!");
	});
}
