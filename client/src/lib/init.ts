import { PUBLIC_ENABLE_PERFORMANCE_LOGS } from "$env/static/public";
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
import {
	API_VERSION,
	GetStatus,
	GetUser,
	logPerformanceMarkDeltas,
	parseApiResult,
} from "openselves-common";

if (PUBLIC_ENABLE_PERFORMANCE_LOGS === "1") {
	logPerformanceMarkDeltas();
}

export async function initApp() {
	performance.mark("init");
	console.log("OpenSelves client version", API_VERSION);

	// IDB
	performance.mark("init.idb");
	await IDB.init();
	performance.mark("init.idb");

	// Persistent storage
	performance.mark("init.storage");
	await PersistentStorage.setInstance(new IDBStorage());
	const storage = PersistentStorage.getInstance();
	performance.mark("init.storage");

	// SyncWorker
	performance.mark("init.syncworker");
	SyncWorker.initialize(appState.isAuthenticated && navigator.onLine);

	window.addEventListener("online", () => {
		if (appState.isAuthenticated) {
			SyncWorker.getInstance().resume();
		}
	});
	window.addEventListener("offline", () => {
		SyncWorker.getInstance().pause();
	});
	performance.mark("init.syncworker");

	// i18n
	performance.mark("init.locale");
	await setLocale((await storage.get(LOCALE_STORAGE_KEY, true)) || DEFAULT_LOCALE, false);
	performance.mark("init.locale");

	// Server url
	performance.mark("init.api.url");
	const storedUrl = await storage.get(SERVER_URL_STORAGE_KEY, true);
	if (storedUrl) {
		apiState.url = storedUrl;
	}
	performance.mark("init.api.url");

	performance.mark("init.api.status");
	const storedStatus = await storage.get(SERVER_STATUS_STORAGE_KEY, true);
	if (storedStatus) {
		apiState.status = parseApiResult(GetStatus, JSON.parse(storedStatus));
	} else {
		scheduleOnlineCheck(0);
	}
	performance.mark("init.api.status");

	// User data
	performance.mark("init.userdata");
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
	performance.mark("init.userdata");

	performance.mark("init");
}
