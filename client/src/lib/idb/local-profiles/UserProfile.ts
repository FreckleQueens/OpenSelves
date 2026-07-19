import type { KnownSubspace } from "$lib/idb/IDBKnownSubspace";
import type { UserProfileData } from "$lib/idb/local-profiles/UserProfileManager";
import { userProfilesState } from "$lib/idb/local-profiles/local-profile.svelte";
import type { GetUserResult } from "openselves-common";
import type { Ed25519Sk } from "openselves-common/willow";

export type OwnSubspace = KnownSubspace & {
	secretKey: Ed25519Sk;
};

export class UserProfile {
	public static of(userId: string) {
		const data = userProfilesState.data.find((profile) => profile.userId === userId);
		if (!data) {
			throw new Error("Couldn't find profile for user id " + userId, {
				cause: userProfilesState.data,
			});
		}
		return new UserProfile(data);
	}

	public readonly userId: string;
	public readonly onlineData: Partial<GetUserResult>;
	public readonly handle: string;

	public readonly offline: boolean;
	public readonly knownSubspaces: KnownSubspace[];
	public readonly ownSubspace: OwnSubspace;

	protected constructor(data: UserProfileData) {
		this.userId = data.userId;
		this.onlineData = { ...data };
		this.handle = data.userId + "@" + data.domain;
		this.offline = data.offline;
		this.knownSubspaces = data.knownSubspaces;
		const ownSubspaces = this.knownSubspaces.filter(this.isOwnSubspace);
		if (ownSubspaces.length > 1) {
			throw new Error("Found multiple own subspaces", { cause: ownSubspaces });
		}
		if (ownSubspaces.length === 0) {
			throw new Error("User has no own subspace");
		}
		this.ownSubspace = ownSubspaces[0];
	}

	public get isEmailVerified() {
		return this.onlineData.isEmailVerified;
	}

	private isOwnSubspace(knownSubspace: KnownSubspace): knownSubspace is OwnSubspace {
		return !!knownSubspace.secretKey;
	}
}
