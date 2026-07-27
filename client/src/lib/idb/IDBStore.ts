import { IDB, IDBTransactionWrapper } from "$lib/idb";
import { IDBArea } from "$lib/idb/IDBArea";
import { ENTRY_STORE_NAME, type EntryStore } from "$lib/idb/IDBEntry";
import { PAYLOAD_STORE_NAME, type PayloadStore } from "$lib/idb/IDBPayload";
import { type EntryDataModel, type EntryDataModelSchema } from "openselves-common/client";
import {
	Area,
	type AuthorisedEntryWithPayload,
	EntryWrapper,
	MemoryStore,
	NamespaceId,
	Path,
	type SubspaceId,
	type Timestamp,
} from "openselves-common/willow";

export type IDBStoreContext = {
	tx?: IDBTransactionWrapper<EntryStore | PayloadStore>;
	dontMarkSavedEntriesForSync?: boolean;
};

export type EntrySubscription = {
	callback: (entry: AuthorisedEntryWithPayload) => Promise<void> | void;
	area?: Area;
};

export class IDBStore extends MemoryStore<AuthorisedEntryWithPayload, IDBStoreContext> {
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
		entryToAdd: AuthorisedEntryWithPayload;
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
		entries: AuthorisedEntryWithPayload[],
		ctx: IDBStoreContext = {},
	): Promise<AuthorisedEntryWithPayload[]> {
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
			| { subscription: EntrySubscription; entryToAdd: AuthorisedEntryWithPayload }
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
		entryToAdd: AuthorisedEntryWithPayload,
		entriesToRemove: AuthorisedEntryWithPayload[],
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
			if (!subscription.area || Area.includesEntry(subscription.area, entryToAdd)) {
				this.pendingSubscriptionUpdates.push({
					subscription,
					entryToAdd,
				});
			}
		}
	}

	public subscribe(
		callback: (entry: AuthorisedEntryWithPayload) => Promise<void> | void,
		area?: Area,
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
		timesStart: Timestamp = 0n,
		timesEnd: Timestamp | undefined = undefined,
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
