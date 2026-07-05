import { PersistentStorage } from "$lib/PersistentStorage";
import { appState } from "$lib/appState.svelte";
import { IDB } from "$lib/idb";
import {
	BaseSchema,
	EntryDataModel,
	type SchemaStatic,
	type SchemaType,
	isValidSchemaKey,
} from "openselves-common/client";
import {
	type EntryWithPayload,
	EntryWrapper,
	MemoryStore,
	OPENSELVES_NAMESPACE_ID,
} from "openselves-common/willow";
import { onDestroy } from "svelte";
import { SvelteSet } from "svelte/reactivity";

export const activeSubscriptions: Set<() => SubscriptionState<SchemaType & typeof BaseSchema>> =
	new SvelteSet();

export type SubscriptionState<Schema extends SchemaType & typeof BaseSchema> = {
	loaded: boolean;
	dataModels: EntryDataModel<Schema>[];
	staticData: SchemaStatic<Schema>[];
};

export function subscribeToModel<Schema extends SchemaType & typeof BaseSchema>(model: {
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
		const idb = IDB.getInstance();
		const storage = PersistentStorage.getInstance();
		const userId = storage.getUserId();

		unsubscribe = idb.entries.subscribe(
			OPENSELVES_NAMESPACE_ID,
			userId,
			modelPathPrefix,
			async (entry) => {
				performance.mark("subscribe.callback." + model.getModelKey());
				await store.ingest([entry]);
				dataModels = await reconstructStateDataModels();
				performance.mark("subscribe.callback." + model.getModelKey());
			},
		);

		const store = new MemoryStore<EntryWithPayload>(OPENSELVES_NAMESPACE_ID);
		const entries = await idb.entries.getByPathPrefix(
			OPENSELVES_NAMESPACE_ID,
			userId,
			modelPathPrefix,
		);
		await store.ingest(entries);

		async function reconstructStateDataModels() {
			performance.mark("reconstructStateDataModels." + model.getModelKey());
			const entries = await Promise.all(
				(await store.getEntries()).map((entry) => EntryWrapper.load(entry)),
			);
			const map = [
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				...new Set(
					entries.map(
						(entry) => entry.path.substring(modelPathPrefix.length + 1).split("/")[0],
					),
				),
			]
				.map((id) =>
					entries.filter((entry) =>
						entry.path.startsWith(`/${model.getModelKey()}/${id}/`),
					),
				)
				.filter((entries) => entries.length > 0)
				.map((entries) => new model(userId, entries));
			performance.mark("reconstructStateDataModels." + model.getModelKey());
			return map;
		}

		dataModels = await reconstructStateDataModels();
		loaded = true;
	})();

	return stateFn;
}

export function proxyEntryDataModel<Schema extends SchemaType & typeof BaseSchema>(
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

export function proxyEntryDataModels<Schema extends SchemaType & typeof BaseSchema>(
	models: EntryDataModel<Schema>[],
): SchemaStatic<Schema>[] {
	return models.map((model) => proxyEntryDataModel(model));
}
