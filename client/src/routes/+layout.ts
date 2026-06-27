import "$lib/global-error-handling.svelte";
import "$lib/appState.svelte.js";

import { PUBLIC_TEST_ENVIRONMENT } from "$env/static/public";
import { PersistentStorage } from "$lib/PersistentStorage";
import { IDB } from "$lib/idb";
import { SyncWorker } from "$lib/idb/SyncWorker.js";
import { tick } from "svelte";

export const prerender = true;
export const ssr = false;

if (PUBLIC_TEST_ENVIRONMENT === "1") {
	window.openselves = {
		IDB,
		PersistentStorage: PersistentStorage,
		SyncWorker,
		tick,
	};
}
