import { PersistentStorage } from "$lib/PersistentStorage";
import { appState } from "$lib/appState.svelte";
import { type IDBSyncedModel, IDBSyncedModelEvent } from "$lib/idb";
import { type SyncedModelBase } from "$lib/idb";
import { onDestroy, onMount } from "svelte";

export type SubscriptionState<Model extends SyncedModelBase> = {
	loaded?: boolean;
	records: Model[];
};

export function subscribeToModel<Model extends SyncedModelBase>(
	model: IDBSyncedModel<Model>,
	state: SubscriptionState<Model>,
) {
	state.loaded = false;

	let subscription: (event: IDBSyncedModelEvent<Model>) => void;
	onMount(async () => {
		if (!appState.isAuthenticated) {
			return;
		}

		const storage = PersistentStorage.getInstance();
		const userId = storage.getUserId();

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
		if (subscription) {
			model.unsubscribe(subscription);
		}
	});
}

export function sortBy<T>(
	direction: "asc" | "desc" | ((obj: T) => string | boolean | number),
	...valueGetters: ((obj: T) => string | boolean | number)[]
): (a: T, b: T) => number {
	let directionMultiplier: number;
	if (typeof direction === "string") {
		directionMultiplier = direction === "asc" ? 1 : -1;
	} else {
		directionMultiplier = 1;
		valueGetters = [direction, ...valueGetters];
	}
	return (a: T, b: T) => {
		for (let i = 0; i < valueGetters.length; i++) {
			const fieldGetter = valueGetters[i];
			let aValue = fieldGetter(a),
				bValue = fieldGetter(b);
			if (typeof aValue === "string" && typeof bValue === "string") {
				aValue = aValue.toLowerCase();
				bValue = bValue.toLowerCase();
			}
			if (aValue < bValue) {
				return -1 * directionMultiplier;
			}
			if (aValue > bValue) {
				return 1 * directionMultiplier;
			}
		}
		return 0;
	};
}
