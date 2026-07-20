import { IDB, IDBTransactionWrapper } from "$lib/idb";
import { IDBArea } from "$lib/idb/IDBArea";
import { ENTRY_STORE_NAME, type EntryStore } from "$lib/idb/IDBEntry";
import { PAYLOAD_STORE_NAME, type PayloadStore } from "$lib/idb/IDBPayload";
import { type EntryDataModel, type EntryDataModelSchema } from "openselves-common/client";
import {
	Area,
	type EntryWithPayload,
	EntryWrapper,
	MemoryStore,
	NamespaceId,
	Path,
	type SubspaceId,
} from "openselves-common/willow";

export type IDBStoreContext = {
	tx?: IDBTransactionWrapper<EntryStore | PayloadStore>;
	dontMarkSavedEntriesForSync?: boolean;
};

export type EntrySubscription = {
	callback: (entry: EntryWithPayload) => Promise<void> | void;
	area?: Area<EntryWithPayload, IDBStoreContext, IDBStore>;
};

export class IDBStore extends MemoryStore<EntryWithPayload, IDBStoreContext> {
	private static readonly instances: Map<string, IDBStore> = new Map();

	public static getInstance(namespaceId: NamespaceId): IDBStore {
		const namespaceIdKey = namespaceId.toHex();
		let store = this.instances.get(namespaceIdKey);
		if (!store) {
			store = new IDBStore(namespaceId);
			this.instances.set(namespaceIdKey, store);
		}
		return store;
	}

	public static free(namespaceId: NamespaceId) {
		this.instances.delete(namespaceId.toHex());
	}

	private readonly subscriptions = new Set<EntrySubscription>();
	private readonly pendingSubscriptionUpdates: {
		subscription: EntrySubscription;
		entryToAdd: EntryWithPayload;
	}[] = [];
	private isInitialized: boolean = false;

	private constructor(namespaceId: NamespaceId) {
		super(namespaceId);
	}

	public async init(ctx: IDBStoreContext = {}) {
		if (!this.isInitialized) {
			await super.ingest(
				await IDB.getInstance().entries.getByNamespaceId(this.namespaceId, ctx.tx),
				{
					...ctx,
					tx: undefined,
				},
			);
			this.isInitialized = true;
		}
	}

	public async ingest(
		entries: EntryWithPayload[],
		ctx: IDBStoreContext = {},
	): Promise<EntryWithPayload[]> {
		if (!this.isInitialized) {
			await this.init(ctx);
		}
		const survivingEntries = await IDB.getInstance().transaction(
			[ENTRY_STORE_NAME, PAYLOAD_STORE_NAME],
			async (tx) => {
				return super.ingest(entries, { ...ctx, tx });
			},
			ctx.tx,
		);

		let subscriptionUpdate:
			| { subscription: EntrySubscription; entryToAdd: EntryWithPayload }
			| undefined;
		do {
			subscriptionUpdate = this.pendingSubscriptionUpdates.shift();
			if (subscriptionUpdate) {
				const { subscription, entryToAdd } = subscriptionUpdate;
				await subscription.callback({ ...entryToAdd });
			}
		} while (subscriptionUpdate);

		return survivingEntries;
	}

	protected async addRemoveEntries(
		entryToAdd: EntryWithPayload,
		entriesToRemove: EntryWithPayload[],
		ctx: IDBStoreContext = {},
	): Promise<void> {
		if (ctx.tx) {
			await IDB.getInstance().entries.putAndDelete(
				entryToAdd,
				!ctx.dontMarkSavedEntriesForSync,
				entriesToRemove,
				ctx.tx,
			);
		}

		await super.addRemoveEntries(entryToAdd, entriesToRemove);

		for (const subscription of this.subscriptions.values()) {
			if (!subscription.area || subscription.area.includesEntry(entryToAdd)) {
				this.pendingSubscriptionUpdates.push({
					subscription,
					entryToAdd,
				});
			}
		}
	}

	public subscribe(
		callback: (entry: EntryWithPayload) => Promise<void> | void,
		area?: Area<EntryWithPayload, IDBStoreContext, IDBStore>,
	) {
		const subscription: EntrySubscription = {
			callback,
			area,
		};
		this.subscriptions.add(subscription);
		return () => {
			this.subscriptions.delete(subscription);
		};
	}

	public area(
		subspaceId: SubspaceId,
		path: Path = Path.EMPTY,
		timesStart: bigint = 0n,
		timesEnd: bigint | "open" = "open",
	): IDBArea {
		return new IDBArea(this, subspaceId, path, timesStart, timesEnd);
	}

	public loadDataModel<
		Model extends EntryDataModel<Schema>,
		Schema extends EntryDataModelSchema = Model extends EntryDataModel<infer T> ? T : never,
	>(
		model: {
			new (subspaceId: SubspaceId, from: EntryWrapper[]): Model;
			getModelKey(): string;
		},
		subspaceId: SubspaceId,
		modelId: string,
		ctx: IDBStoreContext = {},
	) {
		return this.area(subspaceId, Path.fromStrings(model.getModelKey(), modelId)).loadDataModel<
			Model,
			Schema
		>(model, ctx);
	}
}
