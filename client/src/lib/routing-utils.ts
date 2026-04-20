import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { appState } from "$lib/appState.svelte.js";

export function requireAuth() {
	return (async () => {
		if (!appState.isAuthenticated) {
			await goto(resolve("/"));
		}
	})();
}

export function requireGuest() {
	return (async () => {
		if (appState.isAuthenticated) {
			await goto(resolve("/"));
		}
	})();
}
