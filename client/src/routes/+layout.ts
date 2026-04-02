import { SyncWorker } from "$lib/idb/SyncWorker";
import { Storage } from "$lib/storage";

export const prerender = true;
export const ssr = false;

(async () => {
	const storage = await Storage.getStorage();
	SyncWorker.initialize(!storage.isOffline() && navigator.onLine);
})();
