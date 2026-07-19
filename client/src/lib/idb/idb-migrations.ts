import { ENTRY_STORE_NAME, IDBEntry } from "$lib/idb/IDBEntry";
import { KNOWN_SUBSPACE_STORE_NAME } from "$lib/idb/IDBKnownSubspace";
import { PAYLOAD_STORE_NAME } from "$lib/idb/IDBPayload";
import { STORAGE_ENTRY_STORE_NAME } from "$lib/idb/IDBStorageEntry";
import { IDB, IDBTransactionWrapper } from "$lib/idb/idb";
import type { OwnSubspace } from "$lib/idb/local-profiles/UserProfile";
import { Front, Member, serializeValueToPayloadUnsafe } from "openselves-common/client";
import {
	type ByteString,
	Ed25519,
	Entry,
	EntryWrapper,
	PayloadDigest,
} from "openselves-common/willow";

export const IDB_MIGRATIONS: {
	type: "schema" | "data";
	run: (db: IDBDatabase, tx: IDBTransaction | null, idb: IDB) => Promise<void> | void;
}[] = [
	{
		type: "schema",
		run: (db) => {
			const membersStore = db.createObjectStore("members", { keyPath: "id" });
			membersStore.createIndex("id", "id", { unique: true });
			membersStore.createIndex("userId", "userId");
		},
	},
	{
		type: "schema",
		run: (db) => {
			const logsStore = db.createObjectStore("logs", {
				keyPath: "id",
			});
			logsStore.createIndex("id", "id", { unique: true });
			logsStore.createIndex("memberId", "memberId");
		},
	},
	{
		type: "schema",
		run: (db) => {
			const frontsStore = db.createObjectStore("fronts", {
				keyPath: "id",
			});
			frontsStore.createIndex("id", "id", { unique: true });
			frontsStore.createIndex("userId", "userId");
			frontsStore.createIndex("memberId", "memberId");

			const logsStore = frontsStore.transaction.objectStore("logs");
			logsStore.createIndex("frontId", "frontId");
		},
	},
	{
		type: "schema",
		run: (db) => {
			const storageEntriesStore = db.createObjectStore(STORAGE_ENTRY_STORE_NAME, {
				keyPath: "key",
			});
			storageEntriesStore.createIndex("key", "key", { unique: true });

			const logsStore = storageEntriesStore.transaction.objectStore("logs");
			logsStore.createIndex("userId", "userId");
		},
	},
	{
		type: "schema",
		run: (db) => {
			const attachmentsStore = db.createObjectStore("attachments", {
				keyPath: "id",
			});
			attachmentsStore.createIndex("id", "id", { unique: true });
			attachmentsStore.createIndex("userId", "userId");
		},
	},

	// create entries store
	{
		type: "schema",
		run: (db) => {
			const entriesStore = db.createObjectStore(ENTRY_STORE_NAME, {
				keyPath: ["namespaceId", "subspaceId", "path"],
			});
			entriesStore.createIndex("primaryKey", ["namespaceId", "subspaceId", "path"], {
				unique: true,
			});
			entriesStore.createIndex("namespaceId", "namespaceId");
			entriesStore.createIndex("payloadDigest", "payloadDigest");
			entriesStore.createIndex("namespaceIdSubspaceId", ["namespaceId", "subspaceId"]);
			entriesStore.createIndex("namespaceIdSubspaceIdSavedAt", [
				"namespaceId",
				"subspaceId",
				"savedAt",
			]);
		},
	},

	// create payloads store
	{
		type: "schema",
		run: (db) => {
			const payloadStore = db.createObjectStore(PAYLOAD_STORE_NAME, {
				keyPath: "digest",
			});
			payloadStore.createIndex("digest", "digest", { unique: true });
		},
	},

	// create knownSubspaces store
	{
		type: "schema",
		run: (db) => {
			const knownSubspacesStore = db.createObjectStore(KNOWN_SUBSPACE_STORE_NAME, {
				keyPath: ["userId", "subspaceId"],
			});
			knownSubspacesStore.createIndex("primaryKey", ["userId", "subspaceId"], {
				unique: true,
			});
			knownSubspacesStore.createIndex("userId", "userId");
		},
	},

	// migrate data from logs, members, fronts and attachments to entries and payloads
	{
		type: "data",
		run: async (db, _, idb) => {
			const nativeTx = db.transaction(["members", "fronts", "attachments"]);
			const tx = new IDBTransactionWrapper(nativeTx);
			const members: object[] = await tx.getAll("members");
			const fronts: object[] = await tx.getAll("fronts");
			const attachments: object[] = await tx.getAll("attachments");

			const userIds: string[] = [
				...new Set([
					...members.map((member) => member["userId"]),
					...fronts.map((front) => front["userId"]),
					...attachments.map((attachment) => attachment["userId"]),
				]),
			];
			const knownSubspaces = Object.fromEntries(
				await Promise.all(
					userIds.map(async (userId): Promise<[string, OwnSubspace]> => {
						const keys = await Ed25519.generateKey();
						const ownSubspace: OwnSubspace = {
							userId: userId,
							subspaceId: keys.publicKey,
							secretKey: keys.secretKey,
						};
						return [userId, ownSubspace];
					}),
				),
			);

			const payloadsToSave: { digest: PayloadDigest; contents: ByteString }[] = [];
			for (const attachment of attachments) {
				if (
					attachment &&
					"dataUri" in attachment &&
					typeof attachment.dataUri === "string"
				) {
					const contents = serializeValueToPayloadUnsafe(attachment.dataUri);
					const digest = await PayloadDigest.hash(contents);
					payloadsToSave.push({
						digest,
						contents,
					});
				}
			}

			const entriesToSave: EntryWrapper[] = [];
			for (const memberData of members) {
				if (!("userId" in memberData && typeof memberData.userId === "string")) {
					continue;
				}

				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { userId, color, image, archivedReason, updatedAt, ...rest } =
					memberData as Record<string, unknown>;
				const subspace = knownSubspaces[userId as string];
				if (!subspace) {
					throw new Error("No subspace for userId " + userId);
				}
				const member = new Member(subspace.subspaceId, {
					...rest,
					color: color === null || typeof color !== "string" ? undefined : color,
					image: image === null || typeof image !== "string" ? undefined : image,
					archivedReason:
						archivedReason === null || typeof archivedReason !== "string"
							? undefined
							: archivedReason,
				});
				entriesToSave.push(...(await member.flushDirtyEntries()));
			}

			for (const frontData of fronts) {
				if (!("userId" in frontData && typeof frontData.userId === "string")) {
					continue;
				}

				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { userId, note, updatedAt, endedAt, ...rest } = frontData as Record<
					string,
					unknown
				>;
				const subspace = knownSubspaces[userId as string];
				if (!subspace) {
					throw new Error("No subspace for userId " + userId);
				}
				const front = new Front(subspace.subspaceId, {
					...rest,
					note: note === null || typeof note !== "string" ? undefined : note,
					endedAt:
						endedAt === null || !(endedAt instanceof Date)
							? undefined
							: new Date(endedAt),
				});
				entriesToSave.push(...(await front.flushDirtyEntries()));
			}

			await idb.transaction(
				[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME, KNOWN_SUBSPACE_STORE_NAME],
				async (tx) => {
					for (const knownSubspace of Object.values(knownSubspaces)) {
						await tx.put(KNOWN_SUBSPACE_STORE_NAME, knownSubspace);
					}

					for (const entry of entriesToSave) {
						await tx.put(ENTRY_STORE_NAME, IDBEntry.toIDBFriendlyEntry(entry.entry));
						if (entry.payload !== undefined) {
							await tx.put(PAYLOAD_STORE_NAME, {
								digest: entry.payloadDigest,
								contents: entry.payload,
							});
						}
					}

					const savedPayloadDigests: PayloadDigest[] = [];
					for (const payload of payloadsToSave) {
						await tx.put(PAYLOAD_STORE_NAME, payload);
						savedPayloadDigests.push(payload.digest);
					}

					const entries = (await tx.getAll(ENTRY_STORE_NAME)).filter((entry) =>
						Entry.is(entry),
					);
					const payloadsToDelete = savedPayloadDigests.filter(
						(digest) =>
							!entries.find((entry) =>
								PayloadDigest.equals(entry.payloadDigest, digest),
							),
					);
					for (const digest of payloadsToDelete) {
						await tx.delete(PAYLOAD_STORE_NAME, digest);
					}
				},
				undefined,
				db,
			);
		},
	},

	// delete members, fronts, logs and attachments object stores
	{
		type: "schema",
		run: async (db) => {
			db.deleteObjectStore("members");
			db.deleteObjectStore("fronts");
			db.deleteObjectStore("attachments");
			db.deleteObjectStore("logs");
		},
	},
];
