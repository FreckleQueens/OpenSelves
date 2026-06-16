import { WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY } from "$lib";
import { PersistentStorage } from "$lib/PersistentStorage";
import { USER_DATA_STORAGE_KEY } from "$lib/api.svelte";
import type { IDBModel, ModelBase } from "$lib/idb";
import { IDB } from "$lib/idb";
import { localProfilesState } from "$lib/idb/local-profiles/local-profile.svelte";
import { GetUser, type GetUserResult, parseApiResult } from "openselves-common";

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
	private readonly userDataModels: IDBModel<{ userId: string; id: string } & ModelBase, "id">[];

	private constructor() {
		this.idb = IDB.getInstance();
		this.userDataModels = [this.idb.log, this.idb.attachment, this.idb.front, this.idb.member];
	}

	public async wipeUserData(userId: string): Promise<void> {
		const storeNames = [
			...this.userDataModels.map((model) => model.storeName),
			this.idb.storageEntry.storeName,
		];
		await this.idb.transaction(storeNames, async (tx) => {
			for (const model of this.userDataModels) {
				const userRecords = model.parseModels(
					await tx.getByIndex(model.storeName, "userId", IDBKeyRange.only(userId)),
				);
				for (const id of userRecords.map((record) => record.id)) {
					await tx.delete(model.storeName, id);
				}
			}
			const records = this.idb.storageEntry.parseModels(
				await tx.getAll(this.idb.storageEntry.storeName),
			);
			const userRecords = records.filter((record) => record.key.startsWith(userId + "."));
			for (const key of userRecords.map((record) => record.key)) {
				await tx.delete(this.idb.storageEntry.storeName, key);
			}
		});

		const storage = PersistentStorage.getInstance();
		if ((await storage.get(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, true)) === userId) {
			await storage.delete(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, true);
		}
	}

	public async loadProfilesData() {
		const entries = this.idb.storageEntry.parseModels(
			await this.idb.getAll(this.idb.storageEntry.storeName),
		);
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
