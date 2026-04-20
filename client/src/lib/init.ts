import { IDBStorage, PersistentStorage } from "$lib/PersistentStorage";
import { SERVER_URL_STORAGE_KEY, apiState } from "$lib/api.svelte";
import { appState } from "$lib/appState.svelte.js";
import { DEFAULT_LOCALE } from "$lib/i18n/i18n";
import { LOCALE_STORAGE_KEY, setLocale } from "$lib/i18n/i18n-client";
import { IDB } from "$lib/idb";
import { SyncWorker } from "$lib/idb/SyncWorker";

export async function initApp() {
	// IDB
	await IDB.init();

	// Persistent storage
	await PersistentStorage.setInstance(new IDBStorage());

	// SyncWorker
	SyncWorker.initialize(appState.isAuthenticated && navigator.onLine);

	window.addEventListener("online", () => {
		if (appState.isAuthenticated) {
			SyncWorker.getInstance().resume();
		}
	});
	window.addEventListener("offline", () => {
		SyncWorker.getInstance().pause();
	});

	// i18n
	await setLocale(
		(await PersistentStorage.getInstance().getRaw(LOCALE_STORAGE_KEY)) || DEFAULT_LOCALE,
		false,
	);

	// Server url
	const storedUrl = await PersistentStorage.getInstance().getRaw(SERVER_URL_STORAGE_KEY);
	if (storedUrl) {
		apiState.url = storedUrl;
	}
}
