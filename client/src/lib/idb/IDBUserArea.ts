import { IDB } from "$lib/idb";
import type { IDBStore, IDBStoreContext } from "$lib/idb/IDBStore";
import type {
	AnyEntryDataModel,
	EntryDataModel,
	EntryDataModelSchema,
} from "openselves-common/client";
import { Area, type EntryWithPayload, EntryWrapper } from "openselves-common/willow";

export class IDBUserArea extends Area<EntryWithPayload, IDBStoreContext, IDBStore> {
	public constructor(
		store: IDBStore,
		public readonly userId: string,
		path: string,
		timesStart: bigint,
		timesEnd: bigint | "open",
	) {
		super(store, userId, path, timesStart, timesEnd);
	}

	public async saveDataModel(model: AnyEntryDataModel, ctx?: IDBStoreContext) {
		await model.flushDirtyEntries(async (entries) => {
			await this.ingest(
				entries.map((entry) => entry.entryWithPayload),
				ctx,
			);
		});
	}

	public async loadDataModel<Schema extends EntryDataModelSchema>(
		model: {
			new (subspaceId: string, from: EntryWrapper[]): EntryDataModel<Schema>;
		},
		ctx?: IDBStoreContext,
	) {
		const entries = await Promise.all(
			(
				await IDB.getInstance().entries.getByPathPrefix(
					this.store.namespaceId,
					this.userId,
					this.path,
					ctx?.tx,
				)
			).map((entry) => EntryWrapper.load(entry)),
		);
		return entries.length > 0 ? new model(this.userId, entries) : undefined;
	}

	public subscribe(callback: (entry: EntryWithPayload) => Promise<void> | void) {
		return this.store.subscribe(callback, this);
	}
}
