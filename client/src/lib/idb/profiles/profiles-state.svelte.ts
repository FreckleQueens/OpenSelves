import type { ProfileData } from "$lib/idb/profiles/Profile";

export const profilesState: {
	loaded: boolean;
	data: ProfileData[];
} = $state({
	loaded: false,
	data: [],
});
