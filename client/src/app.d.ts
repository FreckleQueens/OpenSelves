// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import { IDB } from "$lib/idb";
import type { SyncWorker } from "$lib/idb/SyncWorker.svelte";
import type { Storage } from "$lib/storage";

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
			Storage: typeof Storage;
			SyncWorker: typeof SyncWorker;
		};
	}
}

export {};
