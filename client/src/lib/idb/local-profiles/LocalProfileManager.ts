import { WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY } from "$lib";
import { PersistentStorage } from "$lib/PersistentStorage";
import { USER_DATA_STORAGE_KEY } from "$lib/api.svelte";
import { IDB } from "$lib/idb";
import { ENTRY_STORE_NAME } from "$lib/idb/IDBEntry";
import { STORAGE_ENTRY_STORE_NAME } from "$lib/idb/IDBStorageEntry";
import { localProfilesState } from "$lib/idb/local-profiles/local-profile.svelte";
import { GetUser, type GetUserResult, parseApiResult } from "openselves-common";
import { OPENSELVES_NAMESPACE_ID } from "openselves-common/willow";

import { PAYLOAD_STORE_NAME } from "../IDBPayload";

export type LocalProfileData = {
	userId: string;
	invalid?: true;
} & Partial<GetUserResult>;

export class LocalProfileManager {
	private static instance: LocalProfileManager | undefined;
	public static getInstance(): LocalProfileManager {
		if (!this.instance) {
			this.instance = new LocalProfileManager();
		}
		return this.instance;
	}

	private readonly idb: IDB;

	private constructor() {
		this.idb = IDB.getInstance();
	}

	public async wipeUserData(userId: string): Promise<void> {
		await this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME, STORAGE_ENTRY_STORE_NAME],
			async (tx) => {
				// Delete entries
				const userEntries = await this.idb.entries.getByNamespaceIdSubspaceId(
					OPENSELVES_NAMESPACE_ID,
					userId,
					tx,
				);
				for (const entry of userEntries) {
					await tx.delete(ENTRY_STORE_NAME, [
						entry.namespaceId,
						entry.subspaceId,
						entry.path,
					]);
				}

				// Delete non-referenced payloads
				const digestsToDelete = userEntries.map((entry) => entry.payloadDigest);
				for (const digest of digestsToDelete) {
					if ((await this.idb.entries.getByPayloadDigest(digest, tx)).length === 0) {
						await tx.delete(PAYLOAD_STORE_NAME, digest);
					}
				}

				// Delete PermanentStorage
				const records = await this.idb.storageEntry.getAll(tx);
				const userRecords = records.filter((record) => record.key.startsWith(userId + "."));
				for (const key of userRecords.map((record) => record.key)) {
					await tx.delete(STORAGE_ENTRY_STORE_NAME, key);
				}
			},
		);

		const storage = PersistentStorage.getInstance();
		if ((await storage.get(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, true)) === userId) {
			await storage.delete(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, true);
		}
	}

	public async loadProfilesData() {
		const entries = await this.idb.storageEntry.getAll();
		localProfilesState.data = entries
			.filter((entry) => entry.key.endsWith("." + USER_DATA_STORAGE_KEY))
			.map((entry) => {
				const userId = entry.key.split(".", 2)[0];
				let userData: Partial<GetUserResult>;
				try {
					userData = parseApiResult(GetUser, JSON.parse(entry.value), true);
				} catch (e) {
					console.error(e);
					return {
						userId,
						invalid: true,
					};
				}
				return {
					userId,
					...userData,
				};
			});
		localProfilesState.loaded = true;
	}
}
