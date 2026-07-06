import { IDBEntry } from "$lib/idb/IDBEntry";
import { IDBPayload } from "$lib/idb/IDBPayload";
import { IDBStorageEntry } from "$lib/idb/IDBStorageEntry";
import { IDB_MIGRATIONS } from "$lib/idb/idb-migrations";

const IDB_NAME = "openselves";

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
	public readonly entries: IDBEntry = new IDBEntry(this);
	public readonly payloads: IDBPayload = new IDBPayload(this);
	private db?: IDBDatabase;

	private async init() {
		async function openDb(
			version?: number,
			forUpgrade: boolean = false,
			forVersion: boolean = false,
		): Promise<{ db: IDBDatabase; tx: IDBTransaction | null }> {
			return new Promise((resolve, reject) => {
				const request = window.indexedDB.open(IDB_NAME, version);
				request.onupgradeneeded = () => {
					if (forUpgrade) {
						resolve({ db: request.result, tx: request.transaction });
					} else if (!forVersion) {
						reject(new Error("Tried to open database that needs an upgrade"));
					}
				};
				request.onsuccess = () => {
					if (!forUpgrade || forVersion) {
						resolve({ db: request.result, tx: request.transaction });
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

			const { db } = await openDb(undefined, false, true);
			const version = db.version;
			db.close();
			return version;
		}

		const currentVersion = await getCurrentIdbVersion();
		console.log("Current IDB version:", currentVersion);

		const targetVersion = IDB_MIGRATIONS.length;
		console.log("Target IDB version:", targetVersion);

		if (currentVersion < targetVersion) {
			console.log("Running migrations...");
			for (let i = currentVersion; i < targetVersion; i++) {
				const { type, run } = IDB_MIGRATIONS[i];
				const version = i + 1;
				console.log("Running migration", version, "of type", type, "...");

				const { db, tx } = await openDb(
					type === "schema" ? version : version - 1,
					type === "schema",
				);

				if (type === "schema" && !tx) {
					throw new Error("Got no transaction while attempting schema migration");
				}

				try {
					await new Promise<void>((resolve, reject) => {
						let transactionCompleted = false;
						if (tx) {
							tx.onerror = (event) => {
								reject(
									new Error("Error in migration transaction", { cause: event }),
								);
							};
							tx.onabort = (event) => {
								reject(
									new Error("Migration transaction aborted", { cause: event }),
								);
							};

							tx.oncomplete = () => {
								transactionCompleted = true;
							};
						}

						(async () => run(db, tx, this))()
							.then(() => {
								if (transactionCompleted || !tx) {
									return resolve();
								}
								tx.oncomplete = () => resolve();
							})
							.catch(reject);
					});
				} catch (e) {
					console.error(e);
					if (tx) {
						tx.abort();
						console.warn("Schema migration transaction aborted");
					}
					throw e;
				} finally {
					db.close();
				}

				if (type === "data") {
					const { db } = await openDb(version, true);
					db.close();
				}

				console.log("Done!");
			}
		} else {
			console.log("IDB is up-to-date");
		}

		const { db } = await openDb(targetVersion);
		this.db = db;
	}

	public async transaction<StoreTypes extends string, ReturningType>(
		storeNames: StoreTypes | StoreTypes[],
		callback: (transaction: IDBTransactionWrapper<StoreTypes>) => Promise<ReturningType>,
		tx?: IDBTransactionWrapper<StoreTypes>,
		db: IDBDatabase | undefined = this.db,
	): Promise<ReturningType> {
		if (!db) {
			throw new Error("db is undefined");
		}

		if (tx) {
			return await callback(tx);
		} else {
			const nativeTransaction = db.transaction(storeNames, "readwrite");
			const transaction = new IDBTransactionWrapper<StoreTypes>(nativeTransaction);

			try {
				return await new Promise<ReturningType>((resolve, reject) => {
					nativeTransaction.onerror = (event) => {
						reject(new Error("Error in transaction", { cause: event }));
					};
					nativeTransaction.onabort = (event) => {
						reject(new Error("Transaction aborted", { cause: event }));
					};

					let transactionCompleted = false;
					nativeTransaction.oncomplete = () => {
						transactionCompleted = true;
					};

					callback(transaction)
						.then((result) => {
							if (transactionCompleted) {
								return resolve(result);
							}

							nativeTransaction.oncomplete = () => resolve(result);
						})
						.catch(reject);
				});
			} catch (e) {
				console.error(e);
				nativeTransaction.abort();
				console.warn("Transaction aborted");
				throw e;
			}
		}
	}

	public async get(
		storeName: string,
		query: IDBValidKey | IDBKeyRange,
		tx?: IDBTransactionWrapper<string>,
	): Promise<object | undefined> {
		return this.transaction(storeName, (transaction) => transaction.get(storeName, query), tx);
	}

	public async getAll(storeName: string, tx?: IDBTransactionWrapper<string>): Promise<object[]> {
		return this.transaction(storeName, (transaction) => transaction.getAll(storeName), tx);
	}

	public async getByIndex(
		storeName: string,
		index: string,
		query: IDBValidKey | IDBKeyRange | null = null,
		direction?: IDBCursorDirection,
		tx?: IDBTransactionWrapper<string>,
	): Promise<object[]> {
		return this.transaction(
			storeName,
			(transaction) => transaction.getByIndex(storeName, index, query, direction),
			tx,
		);
	}

	public async put(
		storeName: string,
		data: object,
		tx?: IDBTransactionWrapper<string>,
	): Promise<IDBValidKey> {
		return this.transaction(storeName, (transaction) => transaction.put(storeName, data), tx);
	}

	public async delete(
		storeName: string,
		query: IDBValidKey | IDBKeyRange,
		tx?: IDBTransactionWrapper<string>,
	): Promise<undefined> {
		return this.transaction(
			storeName,
			(transaction) => transaction.delete(storeName, query),
			tx,
		);
	}
}

export class IDBTransactionWrapper<StoreTypes extends string> {
	constructor(private readonly nativeTransaction: IDBTransaction) {}

	public async get(
		storeName: StoreTypes,
		query: IDBValidKey | IDBKeyRange,
	): Promise<object | undefined> {
		return this.wrapRequest(storeName, (store) => store.get(query));
	}

	public async getAll(storeName: StoreTypes): Promise<object[]> {
		return this.wrapRequest(storeName, (store) => store.getAll());
	}

	public async getByIndex(
		storeName: StoreTypes,
		index: string,
		query: IDBValidKey | IDBKeyRange | null = null,
		direction?: IDBCursorDirection,
	): Promise<object[]> {
		return new Promise((resolve, reject) => {
			const store = this.nativeTransaction.objectStore(storeName);
			const request = store.index(index).openCursor(query, direction);
			const records: object[] = [];
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

	public async put(storeName: StoreTypes, data: object): Promise<IDBValidKey> {
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
