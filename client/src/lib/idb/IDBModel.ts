import { IDB, type ModelBase } from "$lib/idb/idb";
import type { Column } from "drizzle-orm";
import type { PartialBy } from "openselves-common";
import type { Log } from "openselves-common/db";

export abstract class IDBModel<
	Model extends ModelBase & Record<PrimaryKey, PrimaryKeyValue>,
	PrimaryKey extends keyof Model & string,
	PrimaryKeyValue extends Model[PrimaryKey] & string,
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
		let operationType: Log["operationType"] = "update";
		if (!record[this.primaryKey]) {
			operationType = "create";
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

		await this.idb.transaction(["logs", this.storeName], async (transaction) => {
			// Log operation
			const logIdKey = this.getLogIdKey();
			if (logIdKey) {
				await transaction.put("logs", {
					[logIdKey]: record[this.primaryKey],
					operationType: operationType,
					data: JSON.stringify(record),
					executedAt: new Date(),
				});
			}

			// Save record
			await transaction.put(this.storeName, record);
		});

		return record;
	}

	public async delete(recordId: PrimaryKeyValue): Promise<void> {
		await this.idb.transaction(["logs", this.storeName], async (transaction) => {
			// Log operation
			const logIdKey = this.getLogIdKey();
			if (logIdKey) {
				await transaction.put("logs", {
					[logIdKey]: recordId,
					operationType: "delete",
					data: null,
					executedAt: new Date(),
				});
			}

			// Delete record
			await transaction.delete(this.storeName, recordId);
		});
	}

	protected abstract generateUniquePrimaryKey(): PrimaryKeyValue;
	protected abstract getDrizzleModel(): Record<keyof Model, unknown>;
	protected abstract getLogIdKey(): (keyof Log & string & "memberId") | null;

	private matchesModel(record: ModelBase): record is Model {
		for (const [key, column] of Object.entries(this.getDrizzleModel())) {
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

	private matchesModelArray(records: ModelBase[]): records is Model[] {
		for (const record of records) {
			if (!this.matchesModel(record)) {
				throw new Error(`Stored data doesn't match model for ${this.storeName}`);
			}
		}
		return true;
	}

	private isColumn(obj: unknown): obj is Column {
		return typeof obj === "object" && obj != null && "dataType" in obj;
	}
}
