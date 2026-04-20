// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import "../auto-imports";

import type { PersistentStorage } from "$lib/PersistentStorage.ts";
import { IDB } from "$lib/idb";
import type { SyncWorker } from "$lib/idb/SyncWorker.js";

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
			PersistentStorage: typeof PersistentStorage;
			SyncWorker: typeof SyncWorker;
		};
	}
}

export {};
