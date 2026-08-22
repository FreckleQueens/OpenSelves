import { IDBStore } from "$lib/idb/IDBStore";
import { Profile } from "$lib/idb/profiles";
import { OPENSELVES_NAMESPACE_ID } from "openselves-common";
import { EntryDataModel, type EntryDataModelSchema } from "openselves-common/client";
import { type SchemaStatic, isValidSchemaKey } from "openselves-common/schema";
import { AuthorisedEntryWithPayload, Path, SubspaceId } from "openselves-common/willow";
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

export function subscribeToModel<Schema extends EntryDataModelSchema>(
	model: {
		new (
			subspaceId: SubspaceId,
			from: SchemaStatic<Schema> | AuthorisedEntryWithPayload[],
		): EntryDataModel<Schema>;
		getModelKey(): string;
	},
	getSubspaceIds: (() => Promise<SubspaceId[]> | SubspaceId[]) | SubspaceId = () =>
		Profile.getCurrentProfile().ownSubspaces.map((subspace) => subspace.subspaceId),
): () => SubscriptionState<Schema> {
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
		const subspaceIds = SubspaceId.is(getSubspaceIds)
			? [getSubspaceIds]
			: await getSubspaceIds();

		activeSubscriptions.add(
			stateFn as unknown as () => SubscriptionState<EntryDataModelSchema>,
		);

		const modelPathPrefix = Path.fromStrings(model.getModelKey());

		const store = IDBStore.getInstance(OPENSELVES_NAMESPACE_ID);

		const unsubscribes = subspaceIds.map((subspaceId) =>
			IDBStore.getInstance(OPENSELVES_NAMESPACE_ID)
				.area(subspaceId, modelPathPrefix)
				.subscribe(async (newEntry) => {
					const modelIdComponent = newEntry.path[1];
					const modelId = PathComponent.toString(newEntry.path[1]);
					const modelPath: Path = [...modelPathPrefix, modelIdComponent];
					const existingEntries = store.area(subspaceId, modelPath).getEntries();

					const isDeleteEntry = Path.equals(newEntry.path, modelPath);

					if (isDeleteEntry && existingEntries.length === 0) {
						// Model was deleted
						dataModels = dataModels.filter((model) => model.get("id") !== modelId);
						return;
					}

					// Remove previous model
					dataModels = dataModels.filter((model) => model.get("id") !== modelId);

					const newModelEntries: AuthorisedEntryWithPayload[] = existingEntries
						// Skip delete entries
						.filter((entry) => !Path.equals(entry.path, modelPath));
					if (newModelEntries.length > 0) {
						dataModels.push(new model(subspaceId, newModelEntries));
					}
				}),
		);
		unsubscribe = () => unsubscribes.forEach((unsubscribe) => unsubscribe());

		await store.init();
		const initialEntries = subspaceIds
			.map((subspaceId) => store.area(subspaceId, modelPathPrefix).getEntries())
			.flat();

		dataModels = [
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			...new Set(initialEntries.map((entry) => entry.subspaceId.toBase64())),
		]
			.map((base64Subspace) => {
				const subspaceId = SubspaceId.fromBase64(base64Subspace);
				const subspaceEntries = initialEntries.filter((entry) =>
					SubspaceId.equals(entry.subspaceId, subspaceId),
				);
				return [
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					...new Set(
						subspaceEntries.map((entry) => PathComponent.toString(entry.path[1])),
					),
				]
					.map((modelId) =>
						subspaceEntries.filter(
							(entry) =>
								entry.path.length > 2 &&
								Path.extends(entry.path, [
									...modelPathPrefix,
									PathComponent.fromString(modelId),
								]),
						),
					)
					.filter((modelEntries) => modelEntries.length > 0)
					.map((modelEntries) => new model(subspaceId, modelEntries));
			})
			.flat();
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
