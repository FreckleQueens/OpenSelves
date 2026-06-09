import { IDBAttachment } from "$lib/idb/IDBAttachment";
import { IDBFront } from "$lib/idb/IDBFront";
import { IDBLog } from "$lib/idb/IDBLog";
import { IDBMember } from "$lib/idb/IDBMember";
import type { IDBModel } from "$lib/idb/IDBModel";
import { IDBStorageEntry } from "$lib/idb/IDBStorageEntry";

const IDB_NAME = "openselves";

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
	public readonly attachment: IDBAttachment = new IDBAttachment(this);
	public readonly member: IDBMember = new IDBMember(this);
	public readonly front: IDBFront = new IDBFront(this);
	private readonly userDataModels: IDBModel<{ userId: string; id: string } & ModelBase, "id">[] =
		[this.log, this.attachment, this.front, this.member];
	private db?: IDBDatabase;

	private async init() {
		async function openDb(
			version?: number,
			forUpgrade: boolean = false,
			forVersion: boolean = false,
		): Promise<IDBDatabase> {
			return new Promise((resolve, reject) => {
				const request = window.indexedDB.open(IDB_NAME, version);
				request.onupgradeneeded = () => {
					if (forUpgrade) {
						resolve(request.result);
					} else if (!forVersion) {
						reject(new Error("Tried to open database that needs an upgrade"));
					}
				};
				request.onsuccess = () => {
					if (!forUpgrade || forVersion) {
						resolve(request.result);
					}
				};
				request.onblocked = (event) => {
					reject(
						new Error(`Couldn't open IDB with version ${version} (blocked)`, {
							cause: event,
						}),
					);
				};
				request.onerror = (event) => {
					reject(
						new Error(`Couldn't open IDB with version ${version} (error)`, {
							cause: event,
						}),
					);
				};
			});
		}

		async function getCurrentIdbVersion() {
			const databases = await window.indexedDB.databases();
			if (!databases.find((dbInfo) => dbInfo.name === IDB_NAME)) {
				return 0;
			}

			const db = await openDb(undefined, false, true);
			const version = db.version;
			db.close();
			return version;
		}

		function makeMigration(
			getTransaction: (db: IDBDatabase) => IDBTransaction,
		): (version: number) => Promise<void> {
			return async (version: number) => {
				const db = await openDb(version, true);
				const transaction = getTransaction(db);
				return new Promise<void>((resolve, reject) => {
					transaction.onerror = (event) => {
						reject(new Error("Error in migration transaction", { cause: event }));
					};
					transaction.onabort = (event) => {
						reject(new Error("Migration transaction aborted", { cause: event }));
					};
					transaction.oncomplete = () => {
						resolve();
					};
				}).finally(() => {
					db.close();
				});
			};
		}

		const currentVersion = await getCurrentIdbVersion();
		console.log("Current IDB version:", currentVersion);

		const migrations = [
			makeMigration((db) => {
				const membersStore = db.createObjectStore("members", { keyPath: "id" });
				membersStore.createIndex("id", "id", { unique: true });
				membersStore.createIndex("userId", "userId");
				return membersStore.transaction;
			}),
			makeMigration((db) => {
				const logsStore = db.createObjectStore("logs", {
					keyPath: "id",
				});
				logsStore.createIndex("id", "id", { unique: true });
				logsStore.createIndex("memberId", "memberId");
				return logsStore.transaction;
			}),
			makeMigration((db) => {
				const frontsStore = db.createObjectStore("fronts", {
					keyPath: "id",
				});
				frontsStore.createIndex("id", "id", { unique: true });
				frontsStore.createIndex("userId", "userId");
				frontsStore.createIndex("memberId", "memberId");

				const logsStore = frontsStore.transaction.objectStore("logs");
				logsStore.createIndex("frontId", "frontId");

				return frontsStore.transaction;
			}),
			makeMigration((db) => {
				const storageEntriesStore = db.createObjectStore("storageEntries", {
					keyPath: "key",
				});
				storageEntriesStore.createIndex("key", "key", { unique: true });

				const logsStore = storageEntriesStore.transaction.objectStore("logs");
				logsStore.createIndex("userId", "userId");

				return storageEntriesStore.transaction;
			}),
			makeMigration((db) => {
				const attachmentsStore = db.createObjectStore("attachments", {
					keyPath: "id",
				});
				attachmentsStore.createIndex("id", "id", { unique: true });
				attachmentsStore.createIndex("userId", "userId");
				return attachmentsStore.transaction;
			}),
		];
		const targetVersion = migrations.length;
		console.log("Target IDB version:", targetVersion);

		if (currentVersion < targetVersion) {
			console.log("Running migrations...");
			for (let i = currentVersion; i < targetVersion; i++) {
				const migration = migrations[i];
				const version = i + 1;
				console.log("Running migration " + version + "...");
				await migration(version);
				console.log("Done!");
			}
		} else {
			console.log("IDB is up-to-date");
		}

		this.db = await openDb(targetVersion);
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

	public async wipeUserData(userId: string): Promise<void> {
		const storeNames = [
			...this.userDataModels.map((model) => model.storeName),
			this.storageEntry.storeName,
		];
		await this.transaction(storeNames, async (tx) => {
			for (const model of this.userDataModels) {
				const userRecords = model.parseModels(
					await tx.getByIndex(model.storeName, "userId", IDBKeyRange.only(userId)),
				);
				for (const id of userRecords.map((record) => record.id)) {
					await tx.delete(model.storeName, id);
				}
			}
			const records = this.storageEntry.parseModels(
				await tx.getAll(this.storageEntry.storeName),
			);
			const userRecords = records.filter((record) => record.key.startsWith(userId + "."));
			for (const key of userRecords.map((record) => record.key)) {
				await tx.delete(this.storageEntry.storeName, key);
			}
		});
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
