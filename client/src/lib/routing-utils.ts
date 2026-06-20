import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { USER_LANDED_STORAGE_KEY } from "$lib";
import { PersistentStorage } from "$lib/PersistentStorage";
import { appState } from "$lib/appState.svelte.js";

export function requireAuth() {
	return (async () => {
		if (!appState.isAuthenticated) {
			await gotoHomeRoute({
				requires_auth: "1",
			});
		}
	})();
}

export function requireGuest() {
	return (async () => {
		if (appState.isAuthenticated) {
			await gotoHomeRoute({
				requires_guest: "1",
			});
		}
	})();
}

export async function gotoHomeRoute(
	searchParams?: Record<string, string>,
	reload: boolean = false,
) {
	const urlSuffix = searchParams ? `?${new URLSearchParams(searchParams).toString()}` : "";

	let url: string;
	if (appState.isAuthenticated) {
		url = resolve("/front");
	} else {
		if (await PersistentStorage.getInstance().get(USER_LANDED_STORAGE_KEY, true)) {
			url = resolve("/auth");
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
