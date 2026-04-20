import { IDBFront } from "$lib/idb/IDBFront";
import { IDBLog } from "$lib/idb/IDBLog";
import { IDBMember } from "$lib/idb/IDBMember";
import { IDBStorageEntry } from "$lib/idb/IDBStorageEntry";

const IDB_VERSION = 4;

export type ModelBase = object;
export type SyncedModelBase = ModelBase & {
	userId: string;
	id: string;
	createdAt: Date;
	updatedAt: Date;
};

export class IDB {
	private static instance: IDB;

	public static getInstance(): IDB {
		if (!this.instance) {
			throw new Error("IDB not initialized.");
		}
		return this.instance;
	}

	public static async init() {
		if (this.instance) {
			throw new Error("IDB already initialized.");
		}

		const idb = new IDB();
		await idb.init();
		this.instance = idb;
	}

	public readonly storageEntry: IDBStorageEntry = new IDBStorageEntry(this);
	public readonly log: IDBLog = new IDBLog(this);
	public readonly member: IDBMember = new IDBMember(this);
	public readonly front: IDBFront = new IDBFront(this);
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
				function trackTransaction(tx: IDBTransaction) {
					promises.push(
						new Promise<void>((resolve) => {
							tx.oncomplete = () => resolve();
						}),
					);
				}
				if (!dbRequest.transaction) {
					throw new Error("IDBOpenDBRequest has no transaction");
				}
				trackTransaction(dbRequest.transaction);

				if (event.newVersion !== IDB_VERSION) {
					return reject(new Error("Wrong newVersion"));
				}

				if (event.oldVersion < 1) {
					const membersStore = this.db.createObjectStore("members", { keyPath: "id" });
					membersStore.createIndex("id", "id", { unique: true });
					membersStore.createIndex("userId", "userId");
					trackTransaction(membersStore.transaction);
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
					trackTransaction(logsStore.transaction);
				}

				if (event.oldVersion < 3) {
					const frontsStore = this.db.createObjectStore("fronts", {
						keyPath: "id",
					});
					frontsStore.createIndex("id", "id", { unique: true });
					frontsStore.createIndex("userId", "userId");
					frontsStore.createIndex("memberId", "memberId");
					trackTransaction(frontsStore.transaction);

					const logsStore = dbRequest.transaction.objectStore("logs");
					logsStore.createIndex("frontId", "frontId");
				}

				if (event.oldVersion < 4) {
					const storageEntriesStore = this.db.createObjectStore("storageEntries", {
						keyPath: "key",
					});
					storageEntriesStore.createIndex("key", "key", { unique: true });
					trackTransaction(storageEntriesStore.transaction);

					const logsStore = dbRequest.transaction.objectStore("logs");
					logsStore.createIndex("userId", "userId");
				}

				Promise.all(promises).then(() => {
					resolve();
				});
			};
		});
	}

	public async transaction<Model extends ModelBase, StoreTypes extends string, ReturningType>(
		storeNames: StoreTypes | StoreTypes[],
		callback: (transaction: IDBTransactionWrapper<Model, StoreTypes>) => Promise<ReturningType>,
	): Promise<ReturningType> {
		if (!this.db) {
			throw new Error("this.db is undefined");
		}

		const nativeTransaction = this.db.transaction(storeNames, "readwrite");
		const transaction = new IDBTransactionWrapper<Model, StoreTypes>(nativeTransaction);

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

	public async get(
		storeName: string,
		query: IDBValidKey | IDBKeyRange,
	): Promise<ModelBase | undefined> {
		return this.transaction(storeName, (transaction) => transaction.get(storeName, query));
	}

	public async getAll(storeName: string): Promise<ModelBase[]> {
		return this.transaction(storeName, (transaction) => transaction.getAll(storeName));
	}

	public async getByIndex(
		storeName: string,
		index: string,
		query: IDBValidKey | IDBKeyRange | null = null,
		direction?: IDBCursorDirection,
	): Promise<ModelBase[]> {
		return this.transaction(storeName, (transaction) =>
			transaction.getByIndex(storeName, index, query, direction),
		);
	}

	public async put(storeName: string, data: ModelBase): Promise<IDBValidKey> {
		return this.transaction(storeName, (transaction) => transaction.put(storeName, data));
	}

	public async delete(storeName: string, query: IDBValidKey | IDBKeyRange): Promise<undefined> {
		return this.transaction(storeName, (transaction) => transaction.delete(storeName, query));
	}
}

export class IDBTransactionWrapper<Model extends ModelBase, StoreTypes extends string> {
	constructor(private readonly nativeTransaction: IDBTransaction) {}

	public async get(
		storeName: StoreTypes,
		query: IDBValidKey | IDBKeyRange,
	): Promise<Model | undefined> {
		return this.wrapRequest(storeName, (store) => store.get(query));
	}

	public async getAll(storeName: StoreTypes): Promise<Model[]> {
		return this.wrapRequest(storeName, (store) => store.getAll());
	}

	public async getByIndex(
		storeName: StoreTypes,
		index: string,
		query: IDBValidKey | IDBKeyRange | null = null,
		direction?: IDBCursorDirection,
	): Promise<Model[]> {
		return new Promise((resolve, reject) => {
			const store = this.nativeTransaction.objectStore(storeName);
			const request = store.index(index).openCursor(query, direction);
			const records: Model[] = [];
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

	public async put(storeName: StoreTypes, data: Model): Promise<IDBValidKey> {
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
