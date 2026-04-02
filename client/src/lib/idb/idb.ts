import { IDBLog } from "$lib/idb/IDBLog";
import { IDBMember } from "$lib/idb/IDBMember";

const IDB_VERSION = 2;

export type OmitServerFields<Model> = Omit<Model, "createdAt" | "updatedAt">;
export type ModelBase<Model extends OmitServerFields<Model>> = {
	id: string;
	userId: string;
};

export class IDB {
	private static client: IDB;

	public static async getClient(): Promise<IDB> {
		if (!this.client) {
			this.client = await this.createClient();
		}
		return this.client;
	}

	private static async createClient() {
		const idb = new IDB();
		await idb.init();
		return idb;
	}

	public readonly log: IDBLog = new IDBLog(this);
	public readonly member: IDBMember = new IDBMember(this);
	private db?: IDBDatabase;

	private async init() {
		return new Promise<void>((resolve, reject) => {
			const dbRequest = window.indexedDB.open("openselves", IDB_VERSION);
			dbRequest.onerror = () => {
				reject(dbRequest.error);
			};
			dbRequest.onsuccess = () => {
				this.db = dbRequest.result;
				resolve();
			};
			dbRequest.onupgradeneeded = (event) => {
				this.db = dbRequest.result;
				if (!this.db) {
					throw new Error("this.db is undefined");
				}

				const promises: Promise<void>[] = [];
				function trackStoreTransaction(store: IDBObjectStore) {
					promises.push(
						new Promise<void>((resolve) => {
							store.transaction.oncomplete = () => resolve();
						}),
					);
				}

				if (event.newVersion !== IDB_VERSION) {
					return reject(new Error("Wrong newVersion"));
				}

				if (event.oldVersion < 1) {
					const membersStore = this.db.createObjectStore("members", { keyPath: "id" });
					membersStore.createIndex("id", "id", { unique: true });
					membersStore.createIndex("userId", "userId");
					trackStoreTransaction(membersStore);
				}

				if (event.oldVersion === 1) {
					this.db.deleteObjectStore("changelog");
				}

				if (event.oldVersion < 2) {
					const logsStore = this.db.createObjectStore("logs", {
						keyPath: "id",
					});
					logsStore.createIndex("id", "id", { unique: true });
					logsStore.createIndex("memberId", "memberId");
					trackStoreTransaction(logsStore);
				}

				Promise.all(promises).then(() => {
					resolve();
				});
			};
		});
	}

	public async transaction<StoreTypes extends string, ReturningType>(
		storeNames: StoreTypes | StoreTypes[],
		callback: (transaction: IDBTransactionWrapper<StoreTypes>) => Promise<ReturningType>,
	): Promise<ReturningType> {
		if (!this.db) {
			throw new Error("this.db is undefined");
		}

		const nativeTransaction = this.db.transaction(storeNames, "readwrite");
		const transaction = new IDBTransactionWrapper(nativeTransaction);

		try {
			const results = await Promise.all([
				new Promise<void>((resolve, reject) => {
					nativeTransaction.onerror = () => {
						reject(nativeTransaction.error);
					};
					nativeTransaction.onabort = () => {
						reject(new Error("Transaction aborted"));
					};
					nativeTransaction.oncomplete = () => {
						resolve();
					};
				}),
				callback(transaction),
			]);
			return results[1];
		} catch (e) {
			nativeTransaction.abort();
			throw e;
		}
	}

	public async get<M>(
		storeName: string,
		query: IDBValidKey | IDBKeyRange,
	): Promise<ModelBase<M> | undefined> {
		return this.transaction(storeName, (transaction) => transaction.get(storeName, query));
	}

	public async getAll<M>(storeName: string): Promise<ModelBase<M>[]> {
		return this.transaction(storeName, (transaction) => transaction.getAll(storeName));
	}

	public async getByIndex<M>(
		storeName: string,
		index: string,
		query: IDBValidKey | IDBKeyRange | null = null,
		direction?: IDBCursorDirection,
	): Promise<ModelBase<M>[]> {
		return this.transaction(storeName, (transaction) =>
			transaction.getByIndex(storeName, index, query, direction),
		);
	}

	public async put<M>(storeName: string, data: ModelBase<M>): Promise<IDBValidKey> {
		return this.transaction(storeName, (transaction) => transaction.put(storeName, data));
	}

	public async delete(storeName: string, query: IDBValidKey | IDBKeyRange): Promise<undefined> {
		return this.transaction(storeName, (transaction) => transaction.delete(storeName, query));
	}
}

export class IDBTransactionWrapper<StoreTypes extends string> {
	constructor(private readonly nativeTransaction: IDBTransaction) {}

	public async get<M>(
		storeName: StoreTypes,
		query: IDBValidKey | IDBKeyRange,
	): Promise<ModelBase<M> | undefined> {
		return this.wrapRequest(storeName, (store) => store.get(query));
	}

	public async getAll<M>(storeName: StoreTypes): Promise<ModelBase<M>[]> {
		return this.wrapRequest(storeName, (store) => store.getAll());
	}

	public async getByIndex<M>(
		storeName: StoreTypes,
		index: string,
		query: IDBValidKey | IDBKeyRange | null = null,
		direction?: IDBCursorDirection,
	): Promise<ModelBase<M>[]> {
		return new Promise((resolve, reject) => {
			const store = this.nativeTransaction.objectStore(storeName);
			const request = store.index(index).openCursor(query, direction);
			const records: ModelBase<M>[] = [];
			request.onerror = () => {
				reject(request.error);
			};
			request.onsuccess = () => {
				const cursor = request.result;
				if (cursor) {
					records.push(cursor.value);
					cursor.continue();
				} else {
					resolve(records);
				}
			};
		});
	}

	public async put<M>(storeName: StoreTypes, data: ModelBase<M>): Promise<IDBValidKey> {
		return this.wrapRequest(storeName, (store) => store.put(data));
	}

	public async delete(
		storeName: StoreTypes,
		query: IDBValidKey | IDBKeyRange,
	): Promise<undefined> {
		return this.wrapRequest(storeName, (store) => store.delete(query));
	}

	public abort() {
		this.nativeTransaction.abort();
	}

	private async wrapRequest<ReturnType>(
		storeName: StoreTypes,
		performRequest: (store: IDBObjectStore) => IDBRequest<ReturnType>,
	): Promise<ReturnType> {
		return new Promise((resolve, reject) => {
			const store = this.nativeTransaction.objectStore(storeName);
			const request = performRequest(store);
			request.onerror = () => {
				reject(request.error);
			};
			request.onsuccess = () => {
				resolve(request.result);
			};
		});
	}
}
