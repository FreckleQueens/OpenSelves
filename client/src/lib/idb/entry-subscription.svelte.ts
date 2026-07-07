import { PersistentStorage } from "$lib/PersistentStorage";
import { appState } from "$lib/appState.svelte";
import { IDBStore } from "$lib/idb/IDBStore";
import {
	EntryDataModel,
	type EntryDataModelSchema,
	type SchemaStatic,
	isValidSchemaKey,
} from "openselves-common/client";
import { EntryWrapper, OPENSELVES_NAMESPACE_ID } from "openselves-common/willow";
import { onDestroy } from "svelte";
import { SvelteSet } from "svelte/reactivity";

export const activeSubscriptions: Set<() => SubscriptionState<EntryDataModelSchema>> =
	new SvelteSet();

export type SubscriptionState<Schema extends EntryDataModelSchema> = {
	loaded: boolean;
	dataModels: EntryDataModel<Schema>[];
	staticData: SchemaStatic<Schema>[];
};

export function subscribeToModel<Schema extends EntryDataModelSchema>(model: {
	new (subspaceId: string, from: SchemaStatic<Schema> | EntryWrapper[]): EntryDataModel<Schema>;
	getModelKey(): string;
}): () => SubscriptionState<Schema> {
	let loaded: boolean = $state(false);
	let dataModels: EntryDataModel<Schema>[] = $state([]);
	const staticData: SchemaStatic<Schema>[] = $derived(proxyEntryDataModels(dataModels));
	const state: SubscriptionState<Schema> = $derived({
		loaded,
		dataModels,
		staticData,
	});
	const stateFn = () => state;

	let unsubscribe: (() => void) | undefined;
	onDestroy(async () => {
		activeSubscriptions.delete(stateFn);
		if (unsubscribe) {
			unsubscribe();
		}
	});

	(async () => {
		if (!appState.isAuthenticated) {
			return;
		}
		activeSubscriptions.add(stateFn);

		const modelPathPrefix = `/${model.getModelKey()}`;
		const storage = PersistentStorage.getInstance();
		const userId = storage.getUserId();

		const store = IDBStore.getInstance(OPENSELVES_NAMESPACE_ID);

		unsubscribe = IDBStore.getInstance(OPENSELVES_NAMESPACE_ID)
			.userArea(userId, modelPathPrefix)
			.subscribe(async (entry) => {
				const modelId = entry.path.substring(1).split("/")[1];
				const modelPath = `${modelPathPrefix}/${modelId}`;
				const storeEntries = store.userArea(userId, modelPath).getEntries();
				if (entry.path === modelPath && storeEntries.length === 0) {
					dataModels = dataModels.filter((model) => model.get("id") !== modelId);
				} else {
					const newEntries: EntryWrapper[] = [];
					if (entry.payloadLength > 0n) {
						newEntries.push(await EntryWrapper.load(entry));
					}

					const loadedModel = dataModels.find((model) => model.get("id") === modelId);
					if (loadedModel) {
						dataModels = dataModels.filter((model) => model !== loadedModel);
						const loadedEntries = loadedModel.getEntries();
						for (const storeEntry of storeEntries) {
							if (storeEntry.payloadLength === 0n || storeEntry.path === entry.path) {
								continue;
							}

							const loadedEntry = loadedEntries.find(
								(loadedEntry) =>
									loadedEntry.path === storeEntry.path &&
									loadedEntry.payloadDigest === storeEntry.payloadDigest,
							);
							newEntries.push(
								loadedEntry ? loadedEntry : await EntryWrapper.load(storeEntry),
							);
						}
					}
					if (newEntries.length > 0) {
						dataModels.push(new model(userId, newEntries));
					}
				}
			});

		await store.init();
		const initialEntries = store.userArea(userId, modelPathPrefix).getEntries();

		const entries = await Promise.all(initialEntries.map((entry) => EntryWrapper.load(entry)));
		dataModels = [
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			...new Set(
				entries.map(
					(entry) => entry.path.substring(modelPathPrefix.length + 1).split("/")[0],
				),
			),
		]
			.map((id) =>
				entries.filter((entry) => entry.path.startsWith(`/${model.getModelKey()}/${id}/`)),
			)
			.filter((entries) => entries.length > 0)
			.map((entries) => new model(userId, entries));
		loaded = true;
	})();

	return stateFn;
}

export function proxyEntryDataModel<Schema extends EntryDataModelSchema>(
	model: EntryDataModel<Schema>,
): SchemaStatic<Schema> {
	const data = $state(model.data);
	return new Proxy<SchemaStatic<Schema>>(data, {
		get(target: SchemaStatic<Schema>, p: string | symbol, receiver?: unknown) {
			return isValidSchemaKey(model.schema, p) ? target[p] : Reflect.get(model, p, receiver);
		},
		set(
			target: SchemaStatic<Schema>,
			p: string | symbol,
			newValue: unknown,
			receiver?: unknown,
		): boolean {
			if (isValidSchemaKey(model.schema, p)) {
				if (Reflect.set(model, p, newValue, receiver)) {
					if (newValue === "" && model.schema[p].isOptional) {
						newValue = undefined;
					}
					model.set(p, newValue);
					return Reflect.set(target, p, model.get(p), receiver);
				} else {
					return false;
				}
			} else {
				return Reflect.set(model, p, newValue, receiver);
			}
		},
	});
}

export function proxyEntryDataModels<Schema extends EntryDataModelSchema>(
	models: EntryDataModel<Schema>[],
): SchemaStatic<Schema>[] {
	return models.map((model) => proxyEntryDataModel(model));
}
