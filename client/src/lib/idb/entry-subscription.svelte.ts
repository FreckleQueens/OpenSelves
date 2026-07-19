import { PersistentStorage } from "$lib/PersistentStorage";
import { appState } from "$lib/appState.svelte";
import { IDBStore } from "$lib/idb/IDBStore";
import { UserProfile } from "$lib/idb/local-profiles/UserProfile";
import { EntryDataModel, type EntryDataModelSchema } from "openselves-common/client";
import { type SchemaStatic, isValidSchemaKey } from "openselves-common/schema";
import {
	EntryWrapper,
	OPENSELVES_NAMESPACE_ID,
	Path,
	PayloadDigest,
	type SubspaceId,
} from "openselves-common/willow";
import { PathComponent } from "openselves-common/willow";
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
	new (
		subspaceId: SubspaceId,
		from: SchemaStatic<Schema> | EntryWrapper[],
	): EntryDataModel<Schema>;
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
		activeSubscriptions.delete(
			stateFn as unknown as () => SubscriptionState<EntryDataModelSchema>,
		);
		if (unsubscribe) {
			unsubscribe();
		}
	});

	(async () => {
		if (!appState.isAuthenticated) {
			return;
		}
		activeSubscriptions.add(
			stateFn as unknown as () => SubscriptionState<EntryDataModelSchema>,
		);

		const modelPathPrefix = Path.fromStrings(model.getModelKey());
		const profile = UserProfile.of(PersistentStorage.getInstance().getUserId());
		const userSubspaceId = profile.ownSubspace.subspaceId;

		const store = IDBStore.getInstance(OPENSELVES_NAMESPACE_ID);

		unsubscribe = IDBStore.getInstance(OPENSELVES_NAMESPACE_ID)
			.area(userSubspaceId, modelPathPrefix)
			.subscribe(async (entry) => {
				const modelIdComponent = entry.path[1];
				const modelId = PathComponent.toString(entry.path[1]);
				const modelPath: Path = [...modelPathPrefix, modelIdComponent];
				const storeEntries = store.area(userSubspaceId, modelPath).getEntries();
				if (Path.equals(entry.path, modelPath) && storeEntries.length === 0) {
					dataModels = dataModels.filter((model) => model.get("id") !== modelId);
				} else {
					const newEntries: EntryWrapper[] = [];
					if (entry.payloadLength.valueOf() > 0n) {
						newEntries.push(await EntryWrapper.load(entry));
					}

					const loadedModel = dataModels.find((model) => model.get("id") === modelId);
					if (loadedModel) {
						dataModels = dataModels.filter((model) => model !== loadedModel);
						const loadedEntries = loadedModel.getEntries();
						for (const storeEntry of storeEntries) {
							if (
								storeEntry.payloadLength === 0n ||
								Path.equals(storeEntry.path, entry.path)
							) {
								continue;
							}

							const loadedEntry = loadedEntries.find(
								(loadedEntry) =>
									Path.equals(loadedEntry.path, storeEntry.path) &&
									PayloadDigest.equals(
										loadedEntry.payloadDigest,
										storeEntry.payloadDigest,
									),
							);
							newEntries.push(
								loadedEntry ? loadedEntry : await EntryWrapper.load(storeEntry),
							);
						}
					}
					if (newEntries.length > 0) {
						dataModels.push(new model(userSubspaceId, newEntries));
					}
				}
			});

		await store.init();
		const initialEntries = store.area(userSubspaceId, modelPathPrefix).getEntries();

		const entries = await Promise.all(initialEntries.map((entry) => EntryWrapper.load(entry)));
		dataModels = [
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			...new Set(entries.map((entry) => PathComponent.toString(entry.path[1]))),
		]
			.map((id) =>
				entries.filter(
					(entry) =>
						entry.path.length > 2 &&
						Path.extends(entry.path, [
							...modelPathPrefix,
							PathComponent.fromString(id),
						]),
				),
			)
			.filter((entries) => entries.length > 0)
			.map((entries) => new model(userSubspaceId, entries));
		loaded = true;
	})();

	return stateFn;
}

export function proxyEntryDataModel<
	Model extends EntryDataModel<Schema>,
	Schema extends EntryDataModelSchema = Model extends EntryDataModel<infer T> ? T : never,
>(model: Model): SchemaStatic<Schema> {
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

export function proxyEntryDataModels<
	Model extends EntryDataModel<Schema>,
	Schema extends EntryDataModelSchema = Model extends EntryDataModel<infer T> ? T : never,
>(models: Model[]): SchemaStatic<Schema>[] {
	return models.map((model) => proxyEntryDataModel(model));
}
