import { IDBStorage, PersistentStorage } from "$lib/PersistentStorage";
import {
	SERVER_MAX_UPLOAD_SIZE_STORAGE_KEY,
	SERVER_URL_STORAGE_KEY,
	apiState,
	scheduleOnlineCheck,
} from "$lib/api.svelte";
import { appState } from "$lib/appState.svelte.js";
import { DEFAULT_LOCALE } from "$lib/i18n/i18n";
import { LOCALE_STORAGE_KEY, setLocale } from "$lib/i18n/i18n-client";
import { IDB } from "$lib/idb";
import { SyncWorker } from "$lib/idb/SyncWorker";
import { API_VERSION } from "openselves-common";

export async function initApp() {
	console.log("OpenSelves client version", API_VERSION);

	// IDB
	await IDB.init();

	// Persistent storage
	await PersistentStorage.setInstance(new IDBStorage());
	const storage = PersistentStorage.getInstance();

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
	await setLocale((await storage.getRaw(LOCALE_STORAGE_KEY)) || DEFAULT_LOCALE, false);

	// Server url
	const storedUrl = await storage.getRaw(SERVER_URL_STORAGE_KEY);
	if (storedUrl) {
		apiState.url = storedUrl;
	}

	const storedMaxUploadSize = await storage.getRaw(SERVER_MAX_UPLOAD_SIZE_STORAGE_KEY);
	if (typeof storedMaxUploadSize === "string") {
		apiState.maxUploadSize = parseInt(storedMaxUploadSize);
	} else {
		scheduleOnlineCheck(0);
	}
}
