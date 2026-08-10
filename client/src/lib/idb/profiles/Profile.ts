import { WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY } from "$lib";
import { Settings } from "$lib/Settings";
import { Api } from "$lib/api.svelte";
import { IDB } from "$lib/idb";
import { ENTRY_STORE_NAME } from "$lib/idb/IDBEntry";
import { KNOWN_SUBSPACE_STORE_NAME, type KnownSubspace } from "$lib/idb/IDBKnownSubspace";
import { PAYLOAD_STORE_NAME } from "$lib/idb/IDBPayload";
import { PROFILE_STORE_NAME } from "$lib/idb/IDBProfile";
import { SETTING_STORE_NAME } from "$lib/idb/IDBSetting";
import { profilesState } from "$lib/idb/profiles/profiles-state.svelte.js";
import { API_VERSION, GetStatusSchema } from "openselves-common";
import {
	SchemaBuilder,
	type SchemaStatic,
	type SchemaType,
	isValidSchemaStatic,
} from "openselves-common/schema";
import {
	type AuthorisedEntryWithPayload,
	Capability,
	CapabilityAccessMode,
	CapabilitySignData,
	Ed25519,
	Ed25519Sk,
	OPENSELVES_NAMESPACE_ID,
	SubspaceId,
} from "openselves-common/willow";

import { SyncWorker } from "../sync";

export type OwnSubspace = KnownSubspace & {
	secretKey: Ed25519Sk;
};

export type ProfileData = SchemaStatic<typeof Profile.DATA_SCHEMA>;

export class Profile {
	public static readonly CURRENT_PROFILE_ID_KEY = "currentProfileId";
	public static readonly API_SCHEMA = Object.freeze({
		url: SchemaBuilder.string().required(),
		reachable: SchemaBuilder.boolean(),
		mismatchedRemoteVersion: SchemaBuilder.string(),
		status: SchemaBuilder.schema(GetStatusSchema),
		pushTimestamp: SchemaBuilder.string(),
		pullTimestamp: SchemaBuilder.string(),
	}) satisfies SchemaType;
	public static readonly DATA_SCHEMA = Object.freeze({
		id: SchemaBuilder.string().required(),
		name: SchemaBuilder.string(),
		api: SchemaBuilder.schema(this.API_SCHEMA),
	}) satisfies SchemaType;

	private static currentProfileIdLoaded: boolean = false;
	private static currentProfile: Profile | undefined;

	public static getCurrentProfile(): Profile {
		if (!this.currentProfile) {
			throw new Error("No current profile");
		}
		return this.currentProfile;
	}

	public static hasCurrentProfile() {
		if (!this.currentProfileIdLoaded) {
			throw new Error("Current profile not loaded");
		}
		return !!this.currentProfile;
	}

	public static async loadCurrentProfile() {
		const currentProfileId = await Settings.get(Profile.CURRENT_PROFILE_ID_KEY);
		await this.setCurrentProfile(currentProfileId || null);
		this.currentProfileIdLoaded = true;
		profilesState.hasCurrentProfile = this.hasCurrentProfile();
	}

	public static async loadProfilesData() {
		profilesState.data = await IDB.getInstance().profiles.getAll();
		profilesState.loaded = true;
	}

	public static async setCurrentProfile(profileId: string | null) {
		if (profileId === null) {
			this.currentProfile = undefined;
			await Settings.set(Profile.CURRENT_PROFILE_ID_KEY, undefined);
			profilesState.hasCurrentProfile = false;
			profilesState.isSyncEnabled = false;
			profilesState.isApiReachable = false;
		} else {
			const profile = await Profile.getById(profileId);
			await Settings.set(Profile.CURRENT_PROFILE_ID_KEY, profileId);
			this.currentProfile = profile;
			profilesState.hasCurrentProfile = true;
			profilesState.isSyncEnabled = profile.isSyncEnabled();
			profilesState.isApiReachable = profilesState.isSyncEnabled && profile.isApiReachable();

			await this.dismissWarnForRemainingLocalData();

			if (SyncWorker.isInitialized()) {
				SyncWorker.bootstrap();
			}
		}
	}

	public static async dismissWarnForRemainingLocalData() {
		await Settings.delete(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY);
	}

	public static async wipeProfileData(profileId: string): Promise<void> {
		const profile = await Profile.getById(profileId);
		const allProfiles = await Promise.all(
			profilesState.data.map((profileData) => Profile.getById(profileData.id)),
		);
		const idb = IDB.getInstance();
		await idb.transaction(
			[
				PROFILE_STORE_NAME,
				KNOWN_SUBSPACE_STORE_NAME,
				ENTRY_STORE_NAME,
				PAYLOAD_STORE_NAME,
				SETTING_STORE_NAME,
			],
			async (tx) => {
				// Delete entries
				const profileEntries: AuthorisedEntryWithPayload[] = [];
				for (const { subspaceId, secretKey } of profile.knownSubspaces) {
					if (
						secretKey ||
						!allProfiles.some(
							(otherProfile) =>
								otherProfile.id !== profile.id &&
								otherProfile.knownSubspaces.some((otherSubspace) =>
									SubspaceId.equals(otherSubspace.subspaceId, subspaceId),
								),
						)
					) {
						profileEntries.push(
							...(await idb.entries.getByNamespaceIdSubspaceId(
								OPENSELVES_NAMESPACE_ID,
								subspaceId,
								tx,
							)),
						);
					}
				}

				for (const entry of profileEntries) {
					await tx.delete(ENTRY_STORE_NAME, [
						entry.namespaceId,
						entry.subspaceId,
						entry.path,
					]);
				}

				// Delete non-referenced payloads
				const digestsToDelete = profileEntries.map((entry) => entry.payloadDigest);
				for (const digest of digestsToDelete) {
					if ((await idb.entries.getByPayloadDigest(digest, tx)).length === 0) {
						await tx.delete(PAYLOAD_STORE_NAME, digest);
					}
				}

				// Delete PermanentStorage
				const records = await idb.settings.getAll(tx);
				const profileRecords = records.filter((record) =>
					record.key.startsWith(profile.id + "."),
				);
				for (const key of profileRecords.map((record) => record.key)) {
					await tx.delete(SETTING_STORE_NAME, key);
				}

				for (const subspace of profile.knownSubspaces) {
					await tx.delete(KNOWN_SUBSPACE_STORE_NAME, [
						subspace.profileId,
						subspace.subspaceId,
					]);
				}

				await tx.delete(PROFILE_STORE_NAME, profile.id);
			},
		);

		if ((await Settings.get(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY)) === profile.id) {
			await Settings.delete(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY);
		}

		profilesState.data = profilesState.data.filter((data) => data.id !== profileId);
	}

	// TODO: get rid of profilesState, cache profiles on this class
	//  OR
	//  subscribe to profile model, and have a state subscribed to known subspaces model and delete this method
	public static async getById(profileId: string): Promise<Profile> {
		const data = profilesState.data.find((profile) => profile.id === profileId);
		if (!data) {
			throw new Error("Couldn't find profile for id " + profileId, {
				cause: profilesState.data,
			});
		}
		const knownSubspaces = await IDB.getInstance().knownSubspaces.getByProfileId(profileId);
		return new Profile(data, knownSubspaces);
	}

	public static exportToJson(profile: Profile): string {
		const data = { ...profile.data };

		if (data.api) {
			data.api = { ...data.api };
			delete data.api.reachable;
			delete data.api.mismatchedRemoteVersion;
			delete data.api.status;
			delete data.api.pushTimestamp;
			delete data.api.pullTimestamp;
		}

		return JSON.stringify({
			data,
			knownSubspaces: profile._knownSubspaces.map((subspace) => ({
				subspaceId: subspace.subspaceId.toBase64(),
				secretKey: subspace.secretKey?.toBase64(),
			})),
		});
	}

	public static importFromJson(input: string): Profile {
		const obj = JSON.parse(input);
		const data: unknown = obj?.data;

		if (!isValidSchemaStatic(Profile.DATA_SCHEMA, data)) {
			throw new Error("Invalid profile data", { cause: obj });
		}

		return new Profile(
			data,
			obj.knownSubspaces.map((subspace) => ({
				profileId: obj.data.id,
				subspaceId: SubspaceId.fromBase64(subspace.subspaceId),
				secretKey: subspace.secretKey
					? Ed25519Sk.fromBase64(subspace.secretKey)
					: undefined,
			})),
		);
	}

	public static async create(profileData: ProfileData) {
		const profile = new Profile(profileData, []);
		await profile.save();
		return profile;
	}

	public static async update(profileData: ProfileData) {
		const knownSubspaces = await IDB.getInstance().knownSubspaces.getByProfileId(
			profileData.id,
		);
		const profile = new Profile(profileData, knownSubspaces);
		await profile.save();
	}

	private readonly data: ProfileData;
	private readonly _knownSubspaces: KnownSubspace[];

	public constructor(data: ProfileData, knownSubspaces: KnownSubspace[]) {
		this.data = {
			...data,
			api: data.api
				? { ...data.api, status: data.api.status ? { ...data.api.status } : undefined }
				: undefined,
		};
		this._knownSubspaces = [...knownSubspaces];
	}

	public get id(): string {
		return this.data.id;
	}

	public get api(): SchemaStatic<typeof Profile.API_SCHEMA> {
		if (!this.data.api) {
			throw new Error("Sync is not enabled");
		}
		return { ...this.data.api };
	}

	public get pushTimestamp() {
		return this.api.pushTimestamp;
	}

	public async setPushTimestamp(value: string | undefined) {
		if (!this.data.api) {
			throw new Error("Sync is not enabled");
		}
		this.data.api.pushTimestamp = value;
		await this.save();
	}

	public get pullTimestamp() {
		return this.api.pullTimestamp;
	}

	public async setPullTimestamp(value: string | undefined) {
		if (!this.data.api) {
			throw new Error("Sync is not enabled");
		}
		this.data.api.pullTimestamp = value;
		await this.save();
	}

	public get ownSubspaces(): OwnSubspace[] {
		return this._knownSubspaces.filter(this.isOwnSubspace);
	}

	public get knownSubspaces(): KnownSubspace[] {
		return [...this._knownSubspaces];
	}

	public get defaultSubspace(): OwnSubspace {
		const subspace = this.ownSubspaces[0];
		if (!subspace) {
			throw new Error("Profile has no default subspace.");
		}
		return subspace;
	}

	public isSyncEnabled(): boolean {
		return !!this.data.api;
	}

	public isApiReachable(): boolean {
		const status = this.api.status;
		return !!(status && status.ready && status.version === API_VERSION);
	}

	public async setApiMismatchedRemoteVersion(mismatchedRemoteVersion: string) {
		if (!this.data.api) {
			throw new Error("Sync is not enabled");
		}
		this.data.api.mismatchedRemoteVersion = mismatchedRemoteVersion;
		await this.save();
	}

	public async checkApiReachable() {
		if (!this.isSyncEnabled() || !this.data.api) {
			throw new Error("Sync is not enabled");
		}

		console.debug("Checking for api...");

		this.data.api.status = await Api.getStatus(this.data.api.url);
		profilesState.isApiReachable = this.isApiReachable();
		await this.save();
		return this.isApiReachable();
	}

	public async createOwnSubspace() {
		const keys = await Ed25519.generateKey();
		const subspace: OwnSubspace = {
			profileId: this.id,
			subspaceId: keys.publicKey,
			secretKey: keys.secretKey,
		};
		this._knownSubspaces.push(subspace);
		await IDB.getInstance().knownSubspaces.put(subspace);
	}

	public getReadCapabilities(): Capability[] {
		return this._knownSubspaces
			.map((subspace) => {
				const caps: Capability[] = [];

				if (subspace.capabilities) {
					caps.push(...subspace.capabilities);
				}

				if (subspace.secretKey) {
					caps.push(
						Capability.create(
							CapabilityAccessMode.READ,
							OPENSELVES_NAMESPACE_ID,
							subspace.subspaceId,
							[],
						),
					);
				}

				return caps;
			})
			.flat();
	}

	public async save(alsoSaveKnownSubspaces: boolean = false) {
		const idb = IDB.getInstance();
		await idb.transaction([PROFILE_STORE_NAME, KNOWN_SUBSPACE_STORE_NAME], async (tx) => {
			await idb.profiles.put(this.data, tx);

			if (alsoSaveKnownSubspaces) {
				for (const subspace of this._knownSubspaces) {
					await idb.knownSubspaces.put(subspace, tx);
				}
			}
		});

		profilesState.data = profilesState.data.filter((data) => data.id !== this.data.id);
		profilesState.data.push(this.data);

		profilesState.isSyncEnabled = this.isSyncEnabled();
		profilesState.isApiReachable = profilesState.isSyncEnabled && this.isApiReachable();
	}

	public async downloadRecoveryFile() {
		const linkEl = document.createElement("a");
		linkEl.setAttribute(
			"href",
			"data:application/json;charset=utf-8," + Profile.exportToJson(this),
		);
		linkEl.setAttribute("download", this.data.name + ".openselves-profile.json");
		linkEl.click();
	}

	public getSignDataForSubspaceId(subspaceId: SubspaceId): CapabilitySignData {
		const subspace = this.ownSubspaces.find((subspace) =>
			SubspaceId.equals(subspace.subspaceId, subspaceId),
		);
		if (!subspace) {
			throw new Error("No sign data for subspaceId known in current profile", {
				cause: subspaceId,
			});
		}

		return {
			secretKey: subspace.secretKey,
		};
	}

	private isOwnSubspace(knownSubspace: KnownSubspace): knownSubspace is OwnSubspace {
		return !!knownSubspace.secretKey;
	}
}
