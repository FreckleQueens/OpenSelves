import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { USER_LANDED_STORAGE_KEY } from "$lib";
import { Settings } from "$lib/Settings";
import { Profile } from "$lib/idb/profiles";

export function requireCurrentProfile() {
	return (async () => {
		if (Profile.hasCurrentProfile()) {
			return Profile.getCurrentProfile();
		} else {
			await gotoHomeRoute({
				requires_auth: "1",
			});
			return undefined;
		}
	})();
}

export function requireNoCurrentProfile() {
	return (async () => {
		if (Profile.hasCurrentProfile()) {
			await gotoHomeRoute({
				requires_guest: "1",
			});
			return false;
		}
		return true;
	})();
}

export async function gotoHomeRoute(
	searchParams?: Record<string, string>,
	reload: boolean = false,
) {
	const urlSuffix = searchParams ? `?${new URLSearchParams(searchParams).toString()}` : "";

	let url: string;
	if (Profile.hasCurrentProfile()) {
		const profile = Profile.getCurrentProfile();
		if (profile.ownSubspaces.length === 0) {
			url = resolve("/subspaces/create-own");
		} else {
			url = resolve("/dashboard");
		}
	} else {
		if (await Settings.get(USER_LANDED_STORAGE_KEY)) {
			url = resolve("/profiles");
		} else {
			url = resolve("/land");
		}
	}

	// eslint-disable-next-line svelte/no-navigation-without-resolve
	await goto(url + urlSuffix);

	if (reload) {
		window.location.reload();
	}
}
