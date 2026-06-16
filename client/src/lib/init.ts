import { IDBStorage, PersistentStorage } from "$lib/PersistentStorage";
import {
	SERVER_STATUS_STORAGE_KEY,
	SERVER_URL_STORAGE_KEY,
	USER_DATA_STORAGE_KEY,
	apiState,
	needsApiLogout,
	scheduleOnlineCheck,
	scheduleRefreshUserData,
	tryApiLogout,
} from "$lib/api.svelte";
import { appState } from "$lib/appState.svelte.js";
import { DEFAULT_LOCALE } from "$lib/i18n/i18n";
import { LOCALE_STORAGE_KEY, setLocale } from "$lib/i18n/i18n-client";
import { IDB } from "$lib/idb";
import { SyncWorker } from "$lib/idb/SyncWorker";
import { API_VERSION, GetStatus, GetUser, parseApiResult } from "openselves-common";

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
	await setLocale((await storage.get(LOCALE_STORAGE_KEY, true)) || DEFAULT_LOCALE, false);

	// Server url
	const storedUrl = await storage.get(SERVER_URL_STORAGE_KEY, true);
	if (storedUrl) {
		apiState.url = storedUrl;
	}

	const storedStatus = await storage.get(SERVER_STATUS_STORAGE_KEY, true);
	if (storedStatus) {
		apiState.status = parseApiResult(GetStatus, JSON.parse(storedStatus));
	} else {
		scheduleOnlineCheck(0);
	}

	if (appState.isAuthenticated) {
		const storedUserData = await storage.get(USER_DATA_STORAGE_KEY);
		if (storedUserData) {
			try {
				appState.userData = parseApiResult(GetUser, JSON.parse(storedUserData));
			} catch {
				await storage.delete(USER_DATA_STORAGE_KEY);
			}
		}

		if (
			!appState.userData ||
			!appState.userData.isEmailVerified ||
			appState.userData.newEmailRequest
		) {
			scheduleRefreshUserData(0);
		}
	} else {
		if (await needsApiLogout()) {
			await tryApiLogout(5000, false);
		}
	}
}
