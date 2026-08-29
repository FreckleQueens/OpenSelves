import type { ProfileData } from "$lib/idb/profiles/Profile";

export const profilesState: {
	loaded: boolean;
	data: ProfileData[];

	hasCurrentProfile: boolean;
	isSyncEnabled: boolean;
	isApiReachable: boolean;
} = $state({
	loaded: false,
	data: [],

	hasCurrentProfile: false,
	isSyncEnabled: false,
	isApiReachable: false,
});
