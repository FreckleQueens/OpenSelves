import { SyncWorker } from "$lib/idb/SyncWorker.js";
import { Storage } from "$lib/storage";

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
