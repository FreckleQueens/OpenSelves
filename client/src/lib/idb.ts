import { createId } from "@paralleldrive/cuid2";
import type { Column } from "drizzle-orm";
import type { PartialBy } from "openselves-common";
import { type Member, members } from "openselves-common/db";

const IDB_VERSION = 1;
type ModelBase = Record<string, unknown>;

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

				if (event.newVersion === 1) {
					const changelogStore = this.db.createObjectStore("changelog", {
						keyPath: "id",
					});
					changelogStore.createIndex("id", "id", { unique: true });
					trackStoreTransaction(changelogStore);

					const membersStore = this.db.createObjectStore("members", { keyPath: "id" });
					membersStore.createIndex("id", "id", { unique: true });
					membersStore.createIndex("userId", "userId");
					trackStoreTransaction(membersStore);

					Promise.all(promises).then(() => {
						resolve();
					});
				} else {
					reject(new Error("Wrong newVersion"));
				}
			};
		});
	}

	public async get(
		storeName: string,
		query: IDBValidKey | IDBKeyRange,
	): Promise<ModelBase | undefined> {
		return this.wrapTransaction(storeName, "readonly", (store) => store.get(query));
	}

	public async getAll(storeName: string): Promise<ModelBase[]> {
		return this.wrapTransaction(storeName, "readonly", (store) => store.getAll());
	}

	public async getByIndex(
		storeName: string,
		index: string,
		query: IDBValidKey | IDBKeyRange | null = null,
		direction?: IDBCursorDirection,
	): Promise<ModelBase[]> {
		return this.wrapTransaction(storeName, "readonly", (store) => {
			return new Promise((resolve, reject) => {
				const request = store.index(index).openCursor(query, direction);
				const records: ModelBase[] = [];
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
		});
	}

	public async put(storeName: string, data: ModelBase): Promise<IDBValidKey> {
		return this.wrapTransaction(storeName, "readwrite", (store) => store.put(data));
	}

	public async delete(storeName: string, query: IDBValidKey | IDBKeyRange): Promise<undefined> {
		return this.wrapTransaction(storeName, "readwrite", (store) => store.delete(query));
	}

	private async wrapTransaction<ReturnType>(
		storeName: string,
		mode: IDBTransactionMode,
		performRequest: (store: IDBObjectStore) => IDBRequest<ReturnType> | Promise<ReturnType>,
	): Promise<ReturnType> {
		return new Promise((resolve, reject) => {
			if (!this.db) {
				return reject(new Error("this.db is undefined"));
			}
			const transaction = this.db.transaction(storeName, mode);
			const store = transaction.objectStore(storeName);
			const request = performRequest(store);
			if (this.isIDBRequest(request)) {
				request.onerror = () => {
					reject(request.error);
				};
				request.onsuccess = () => {
					resolve(request.result);
				};
			} else if (this.isPromise(request)) {
				request.then(resolve).catch(reject);
			}
		});
	}

	private isIDBRequest(obj: object): obj is IDBRequest {
		return "onsuccess" in obj && "onerror" in obj;
	}

	private isPromise(obj: object): obj is Promise<unknown> {
		return "then" in obj && "catch" in obj;
	}
}

abstract class IDBModel<
	Model extends ModelBase & Record<PrimaryKey, IDBValidKey>,
	PrimaryKey extends keyof Model & string,
> {
	protected constructor(
		private readonly idb: IDB,
		public readonly storeName: string,
		public readonly primaryKey: PrimaryKey,
	) {}

	public async getById(id: string): Promise<Model> {
		const record = await this.idb.get(this.storeName, id);
		if (!record) {
			throw new Error(`Record not found: ${this.storeName}#${id}`);
		}
		if (!this.matchesModel(record)) {
			throw new Error(`Stored data doesn't match model for ${this.storeName}#${id}`);
		}
		return record;
	}

	public async getAll(): Promise<Model[]> {
		const records = await this.idb.getAll(this.storeName);
		if (!this.matchesModelArray(records)) {
			throw new Error(`Stored data doesn't match model for ${this.storeName}`);
		}
		return records;
	}

	public async getByField<Field extends keyof Model & string>(
		field: Field,
		value: Model[Field],
	): Promise<Model[]> {
		const records = await this.idb.getByIndex(this.storeName, field, IDBKeyRange.only(value));
		if (!this.matchesModelArray(records)) {
			throw new Error(`Stored data doesn't match model for ${this.storeName}`);
		}
		return records;
	}

	public async save(record: PartialBy<Model, PrimaryKey>): Promise<Model> {
		if (!record[this.primaryKey]) {
			record = {
				...record,
				[this.primaryKey]: this.generateUniquePrimaryKey(),
			};
		}
		if (!this.matchesModel(record)) {
			throw new Error(
				`Tried to save invalid record for ${this.storeName}: ${JSON.stringify(record)}`,
			);
		}

		const savedKey = await this.idb.put(this.storeName, record);
		if (savedKey !== record[this.primaryKey]) {
			throw new Error("Returned saved key is different from record's key");
		}

		return record;
	}

	public async delete(recordId: Model[PrimaryKey]): Promise<void> {
		await this.idb.delete(this.storeName, recordId);
	}

	protected abstract matchesModel(record: ModelBase): record is Model;

	private matchesModelArray(records: ModelBase[]): records is Model[] {
		for (const record of records) {
			if (!this.matchesModel(record)) {
				throw new Error(`Stored data doesn't match model for ${this.storeName}`);
			}
		}
		return true;
	}

	protected abstract generateUniquePrimaryKey(): Model[PrimaryKey];
}

class IDBMember extends IDBModel<Member, "id"> {
	public constructor(idb: IDB) {
		super(idb, "members", "id");
	}

	protected generateUniquePrimaryKey(): Member["id"] {
		return createId();
	}

	protected matchesModel(record: ModelBase): record is Member {
		for (const [key, column] of Object.entries(members)) {
			if (!this.isColumn(column)) {
				continue;
			}

			if (!(key in record)) {
				console.log(key, record[key], column);
				return false;
			}

			if (record[key] === null && column.notNull) {
				console.log(key, record[key], column);
				return false;
			}

			if (record[key] instanceof Date && column.dataType === "object date") {
				continue;
			}

			if (typeof record[key] !== column.dataType) {
				console.log(key, record[key], column);
				return false;
			}
		}

		return true;
	}

	private isColumn(obj: object): obj is Column {
		return "dataType" in obj;
	}
}
