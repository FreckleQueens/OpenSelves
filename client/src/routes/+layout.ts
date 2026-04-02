import { SyncWorker } from "$lib/idb/SyncWorker.svelte";
import { Storage } from "$lib/storage";

export const prerender = true;
export const ssr = false;

const storage = await Storage.getStorage();
SyncWorker.initialize(!storage.isOffline() && navigator.onLine);

window.addEventListener("online", () => {
	if (!storage.isOffline()) {
		SyncWorker.getInstance().resume();
	}
});
window.addEventListener("offline", () => {
	SyncWorker.getInstance().pause();
});
