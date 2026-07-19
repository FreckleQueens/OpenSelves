import { IDB } from "$lib/idb";
import type { IDBStore, IDBStoreContext } from "$lib/idb/IDBStore";
import type {
	AnyEntryDataModel,
	EntryDataModel,
	EntryDataModelSchema,
} from "openselves-common/client";
import {
	Area,
	type EntryWithPayload,
	EntryWrapper,
	type Path,
	type SubspaceId,
} from "openselves-common/willow";

export class IDBArea extends Area<EntryWithPayload, IDBStoreContext, IDBStore> {
	public constructor(
		store: IDBStore,
		public readonly subspaceId: SubspaceId,
		path: Path,
		timesStart: bigint,
		timesEnd: bigint | "open",
	) {
		super(store, subspaceId, path, timesStart, timesEnd);
	}

	public async saveDataModel(model: AnyEntryDataModel, ctx?: IDBStoreContext) {
		await model.flushDirtyEntries(async (entries) => {
			await this.ingest(
				entries.map((entry) => entry.entryWithPayload),
				ctx,
			);
		});
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
					this.path,
					ctx?.tx,
				)
			).map((entry) => EntryWrapper.load(entry)),
		);
		return entries.length > 0 ? new model(this.subspaceId, entries) : undefined;
	}

	public subscribe(callback: (entry: EntryWithPayload) => Promise<void> | void) {
		return this.store.subscribe(callback, this);
	}
}
