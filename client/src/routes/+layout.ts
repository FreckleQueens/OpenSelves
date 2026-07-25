import "$lib/global-error-handling.svelte";

import { PUBLIC_TEST_ENVIRONMENT } from "$env/static/public";
import { Settings } from "$lib/Settings";
import { IDB } from "$lib/idb";
import { Profile } from "$lib/idb/profiles";
import { SyncWorker } from "$lib/idb/sync/SyncWorker.svelte.js";
import { OPENSELVES_NAMESPACE_ID } from "openselves-common/willow";
import { tick } from "svelte";

export const prerender = true;
export const ssr = false;

if (PUBLIC_TEST_ENVIRONMENT === "1") {
	window.openselves = {
		IDB,
		Settings,
		SyncWorker,
		tick,
		OPENSELVES_NAMESPACE_ID,
		Profile,
	};
}
