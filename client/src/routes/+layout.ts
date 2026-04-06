import "$lib/global-error-handling.svelte";
import "$lib/i18n/i18n-client";

import { PUBLIC_TEST_ENVIRONMENT } from "$env/static/public";
import { IDB } from "$lib/idb";
import { SyncWorker } from "$lib/idb/SyncWorker.svelte";
import { Storage } from "$lib/storage";

export const prerender = true;
export const ssr = false;

const storage = await Storage.getStorage();
SyncWorker.initialize(!storage.isOffline() && navigator.onLine);

window.addEventListener("online", () => {
	if (!storage.isOffline()) {
		SyncWorker.getInstance().resume();
	}
});
window.addEventListener("offline", () => {
	SyncWorker.getInstance().pause();
});

if (PUBLIC_TEST_ENVIRONMENT === "1") {
	window.openselves = {
		IDB,
		Storage,
		SyncWorker,
	};
}
