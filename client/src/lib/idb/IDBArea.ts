import { IDB } from "$lib/idb";
import type { IDBStore, IDBStoreContext } from "$lib/idb/IDBStore";
import { Profile } from "$lib/idb/profiles";
import type {
	AnyEntryDataModel,
	EntryDataModel,
	EntryDataModelSchema,
} from "openselves-common/client";
import {
	type AuthorisedEntryWithPayload,
	EntryWrapper,
	type Path,
	StoreArea,
	type SubspaceId,
	type Timestamp,
} from "openselves-common/willow";

export class IDBArea extends StoreArea<AuthorisedEntryWithPayload, IDBStoreContext, IDBStore> {
	public constructor(
		store: IDBStore,
		public readonly subspaceId: SubspaceId,
		path: Path,
		timesStart: Timestamp,
		timesEnd: Timestamp | undefined,
	) {
		super(store, subspaceId, path, timesStart, timesEnd);
	}

	public async saveDataModel(model: AnyEntryDataModel, profile: Profile, ctx?: IDBStoreContext) {
		await model.flushDirtyEntries(
			profile.getSignDataForSubspaceId(model.subspaceId),
			async (entries) => {
				await this.ingest(
					entries.map((entry) => entry.entryWithPayload),
					ctx,
				);
			},
		);
	}

	public async loadDataModel<
		Model extends EntryDataModel<Schema>,
		Schema extends EntryDataModelSchema = Model extends EntryDataModel<infer T> ? T : never,
	>(
		model: {
			new (subspaceId: SubspaceId, from: EntryWrapper[]): Model;
		},
		ctx?: IDBStoreContext,
	) {
		const entries = await Promise.all(
			(
				await IDB.getInstance().entries.getByPathPrefix(
					this.store.namespaceId,
					this.subspaceId,
					this.area.path,
					ctx?.tx,
				)
			).map((entry) => EntryWrapper.load(entry)),
		);
		return entries.length > 0 ? new model(this.subspaceId, entries) : undefined;
	}

	public subscribe(callback: (entry: AuthorisedEntryWithPayload) => Promise<void> | void) {
		return this.store.subscribe(callback, this.area);
	}
}
