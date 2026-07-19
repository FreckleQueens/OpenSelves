import { WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY } from "$lib";
import { PersistentStorage } from "$lib/PersistentStorage";
import { USER_DATA_STORAGE_KEY, refreshUserData } from "$lib/api.svelte";
import { appState } from "$lib/appState.svelte";
import { IDB } from "$lib/idb";
import { ENTRY_STORE_NAME } from "$lib/idb/IDBEntry";
import type { KnownSubspace } from "$lib/idb/IDBKnownSubspace";
import { STORAGE_ENTRY_STORE_NAME } from "$lib/idb/IDBStorageEntry";
import { userProfilesState } from "$lib/idb/local-profiles/local-profile.svelte";
import { GetUser, type GetUserResult, parseApiResult } from "openselves-common";
import {
	Ed25519,
	type EntryWithPayload,
	OPENSELVES_NAMESPACE_ID,
	SubspaceId,
} from "openselves-common/willow";

import { PAYLOAD_STORE_NAME } from "../IDBPayload";

export type UserProfileData = {
	userId: string;
	offline: boolean;
	knownSubspaces: KnownSubspace[];
} & Partial<GetUserResult>;

export class UserProfileManager {
	private static instance: UserProfileManager | undefined;
	public static getInstance(): UserProfileManager {
		if (!this.instance) {
			this.instance = new UserProfileManager();
		}
		return this.instance;
	}

	private readonly idb: IDB;

	private constructor() {
		this.idb = IDB.getInstance();
	}

	public async wipeUserData(
		profile: UserProfileData,
		allProfiles: UserProfileData[],
	): Promise<void> {
		await this.idb.transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME, STORAGE_ENTRY_STORE_NAME],
			async (tx) => {
				// Delete entries
				const userEntries: EntryWithPayload[] = [];
				for (const { subspaceId, secretKey } of profile.knownSubspaces) {
					if (
						secretKey ||
						!allProfiles.some(
							(otherProfile) =>
								otherProfile.userId !== profile.userId &&
								otherProfile.knownSubspaces.some((otherSubspace) =>
									SubspaceId.equals(otherSubspace.subspaceId, subspaceId),
								),
						)
					) {
						userEntries.push(
							...(await this.idb.entries.getByNamespaceIdSubspaceId(
								OPENSELVES_NAMESPACE_ID,
								subspaceId,
								tx,
							)),
						);
					}
				}

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
				const userRecords = records.filter((record) =>
					record.key.startsWith(profile.userId + "."),
				);
				for (const key of userRecords.map((record) => record.key)) {
					await tx.delete(STORAGE_ENTRY_STORE_NAME, key);
				}
			},
		);

		const storage = PersistentStorage.getInstance();
		if (
			(await storage.get(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, true)) === profile.userId
		) {
			await storage.delete(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, true);
		}
	}

	public async loadProfilesData() {
		const storage = PersistentStorage.getInstance();

		if (appState.isAuthenticated) {
			const storedUserData = await storage.get(USER_DATA_STORAGE_KEY);
			if (storedUserData) {
				try {
					appState.userData = parseApiResult(GetUser, JSON.parse(storedUserData));
				} catch {
					await storage.delete(USER_DATA_STORAGE_KEY);
				}
			}

			if (
				!appState.userData ||
				!appState.userData.isEmailVerified ||
				appState.userData.newEmailRequest
			) {
				await refreshUserData();
			}
		}

		const entries = await this.idb.storageEntry.getAll();
		const userIds = entries
			.filter((entry) => entry.key.endsWith("." + USER_DATA_STORAGE_KEY))
			.map((entry) => entry.key.split(".")[0]);
		userProfilesState.data = await Promise.all(
			userIds.map(async (userId) => {
				return await this.loadProfileData(userId);
			}),
		);
		userProfilesState.loaded = true;
	}

	private async loadProfileData(userId: string): Promise<UserProfileData> {
		const userKnownSubspaces = await this.idb.knownSubspaces.get(userId);

		if (userKnownSubspaces.length === 0) {
			const keys = await Ed25519.generateKey();
			userKnownSubspaces.push({
				userId,
				subspaceId: keys.publicKey,
				secretKey: keys.secretKey,
			});
			await this.idb.knownSubspaces.put(userKnownSubspaces[0]);
		}

		const storage = PersistentStorage.getInstance();
		const rawData = await storage.get(`${userId}.userData`);
		if (!rawData) {
			return {
				userId,
				offline: true,
				knownSubspaces: userKnownSubspaces,
			};
		}

		let userData: Partial<GetUserResult>;
		try {
			userData = parseApiResult(GetUser, JSON.parse(rawData), true);
		} catch (e) {
			console.error(e);
			return {
				userId,
				offline: true,
				knownSubspaces: userKnownSubspaces,
			};
		}
		return {
			userId,
			offline: false,
			...userData,
			knownSubspaces: userKnownSubspaces,
		};
	}
}
