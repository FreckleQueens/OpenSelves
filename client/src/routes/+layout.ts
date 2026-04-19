import "$lib/global-error-handling.svelte";
import "$lib/i18n/i18n-client";
import "$lib/initialize-sync-worker";
import "$lib/app-network-status.svelte.js";

import { PUBLIC_TEST_ENVIRONMENT } from "$env/static/public";
import { IDB } from "$lib/idb";
import { SyncWorker } from "$lib/idb/SyncWorker.js";
import { Storage } from "$lib/storage";

export const prerender = true;
export const ssr = false;

if (PUBLIC_TEST_ENVIRONMENT === "1") {
	window.openselves = {
		IDB,
		Storage,
		SyncWorker,
	};
}
