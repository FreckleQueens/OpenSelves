import type { LocalProfileData } from "./LocalProfileManager";

export const localProfilesState: {
	loaded: boolean;
	data: LocalProfileData[];
} = $state({
	loaded: false,
	data: [],
});

export type LocalProfile = LocalProfileData & {
	handle: string;
};

export function getLocalProfiles(): LocalProfile[] {
	return localProfilesState.data.map((profile) => ({
		...profile,
		handle: profile.userId + "@" + profile.domain,
	}));
}
