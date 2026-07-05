import { IDB, IDBTransactionWrapper } from "$lib/idb";
import type { EntryStore } from "$lib/idb/IDBEntry";
import type { PayloadStore } from "$lib/idb/IDBPayload";
import type { BaseSchema, EntryDataModel, SchemaType } from "openselves-common/client";
import { type EntryWithPayload, EntryWrapper, Store } from "openselves-common/willow";

// TODO: this is an Area (willow), refactor? https://willowprotocol.org/specs/meadowcap/index.html#meadowcap
export class IDBSubStore extends Store<
	EntryWithPayload,
	IDBTransactionWrapper<EntryStore | PayloadStore>
> {
	public constructor(
		namespaceId: string,
		public readonly subspaceId: string,
		public readonly markForSync: boolean = true,
	) {
		super(namespaceId);
	}

	public async getEntries(
		tx?: IDBTransactionWrapper<EntryStore | PayloadStore>,
	): Promise<EntryWithPayload[]> {
		return await IDB.getInstance().entries.getByNamespaceIdSubspaceId(
			this.namespaceId,
			this.subspaceId,
			tx,
		);
	}

	protected async updateEntries(
		entryToAdd: EntryWithPayload,
		entriesToRemove: EntryWithPayload[],
		tx?: IDBTransactionWrapper<EntryStore | PayloadStore>,
	): Promise<void> {
		await IDB.getInstance().entries.putAndDelete(
			entryToAdd,
			this.markForSync,
			entriesToRemove,
			tx,
		);
	}

	public ingest(
		entries: EntryWithPayload[],
		context?: IDBTransactionWrapper<EntryStore | PayloadStore>,
	): Promise<EntryWithPayload[]> {
		if (entries.some((entry) => entry.subspaceId !== this.subspaceId)) {
			throw new Error("Got entry of wrong subspace, expected " + this.subspaceId, {
				cause: entries,
			});
		}
		return super.ingest(entries, context);
	}

	public async saveDataModel(
		model: EntryDataModel<SchemaType & typeof BaseSchema>,
		tx?: IDBTransactionWrapper<EntryStore | PayloadStore>,
	) {
		await model.flushDirtyEntries(async (entries) => {
			await this.ingest(
				entries.map((entry) => entry.entryWithPayload),
				tx,
			);
		});
	}

	public async loadDataModel<Schema extends SchemaType & typeof BaseSchema>(
		model: {
			new (subspaceId: string, from: EntryWrapper[]): EntryDataModel<Schema>;
			getModelKey(): string;
		},
		id: string,
		tx?: IDBTransactionWrapper<EntryStore | PayloadStore>,
	) {
		const entries = await Promise.all(
			(
				await IDB.getInstance().entries.getByPathPrefix(
					this.namespaceId,
					this.subspaceId,
					`/${model.getModelKey()}/${id}`,
					tx,
				)
			).map((entry) => EntryWrapper.load(entry)),
		);
		return entries.length > 0 ? new model(this.subspaceId, entries) : undefined;
	}
}
