import { type IDBSyncedModel, IDBSyncedModelEvent } from "$lib/idb/IDBSyncedModel";
import { type SyncedModelBase } from "$lib/idb/idb";
import { Storage } from "$lib/storage";
import { onDestroy, onMount } from "svelte";

export function subscribeToModel<T extends SyncedModelBase>(
	getModel: () => Promise<IDBSyncedModel<T>>,
	state: {
		loaded?: boolean;
		records: T[];
	},
) {
	state.loaded = false;

	let subscription: (event: IDBSyncedModelEvent<T>) => void;
	onMount(async () => {
		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const model = await getModel();

		subscription = model.subscribe((event) => {
			for (const front of event.savedRecords) {
				const index = state.records.findIndex((localFront) => localFront.id === front.id);
				if (index >= 0) {
					state.records[index] = front;
				} else {
					state.records.push(front);
				}
			}

			for (const id of event.deletedRecordIds) {
				const index = state.records.findIndex((localFront) => localFront.id === id);
				if (index >= 0) {
					state.records.splice(index, 1);
				}
			}
		});
		state.records = await model.getByField("userId", userId);
		state.loaded = true;
	});

	onDestroy(async () => {
		const model = await getModel();
		model.unsubscribe(subscription);
	});
}
