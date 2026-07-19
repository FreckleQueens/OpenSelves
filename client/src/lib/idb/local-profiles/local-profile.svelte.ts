import { UserProfile } from "$lib/idb/local-profiles/UserProfile";

import type { UserProfileData } from "./UserProfileManager.ts";

export const userProfilesState: {
	loaded: boolean;
	data: UserProfileData[];
} = $state({
	loaded: false,
	data: [],
});

export function getUserProfiles(): UserProfile[] {
	return userProfilesState.data.map((profile) => UserProfile.of(profile.userId));
}
