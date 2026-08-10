import { PUBLIC_ENABLE_PERFORMANCE_LOGS } from "$env/static/public";
import { Settings } from "$lib/Settings";
import { DEFAULT_LOCALE } from "$lib/i18n/i18n";
import { LOCALE_STORAGE_KEY, setLocale } from "$lib/i18n/i18n-client";
import { IDB } from "$lib/idb";
import { Profile } from "$lib/idb/profiles";
import { SyncWorker } from "$lib/idb/sync/SyncWorker.svelte";
import { API_VERSION, logPerformanceMarkDeltas } from "openselves-common";

import { scheduleOnlineCheck } from "./api.svelte";

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

	// Profiles
	performance.mark("init.profiles");
	await Profile.loadProfilesData();
	await Profile.loadCurrentProfile();

	if (Profile.hasCurrentProfile()) {
		const profile = Profile.getCurrentProfile();
		if (profile.isSyncEnabled() && !profile.isApiReachable()) {
			scheduleOnlineCheck(0);
		}
	}

	performance.mark("init.profiles");

	// SyncWorker
	performance.mark("init.syncworker");
	SyncWorker.initialize();
	performance.mark("init.syncworker");

	// i18n
	performance.mark("init.locale");
	await setLocale((await Settings.get(LOCALE_STORAGE_KEY)) || DEFAULT_LOCALE, false);
	performance.mark("init.locale");

	performance.mark("init");
}
