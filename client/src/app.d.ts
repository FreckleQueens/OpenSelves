// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import "../auto-imports";

import type { Settings } from "$lib/Settings.ts";
import { IDB } from "$lib/idb";
import { Profile } from "$lib/idb/profiles";
import type { SyncWorker } from "$lib/idb/sync/SyncWorker.svelte.js";
import type { tick } from "svelte";

declare global {
	function t(key: string, ...args: string[]): string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		openselves: {
			IDB: typeof IDB;
			Settings: typeof Settings;
			SyncWorker: typeof SyncWorker;
			tick: typeof tick;
			OPENSELVES_NAMESPACE_ID: typeof OPENSELVES_NAMESPACE_ID;
			Profile: typeof Profile;
		};
	}
}

export {};
