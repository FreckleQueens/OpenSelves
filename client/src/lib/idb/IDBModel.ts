import { SyncWorker } from "$lib/idb/SyncWorker";
import { IDB, IDBTransactionWrapper, type ModelBase, type OmitServerFields } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import type { Column } from "drizzle-orm";
import type { Log } from "openselves-common/db";

export abstract class IDBModel<
	Model extends ModelBase<Model>,
	ModelWithoutUserId extends Omit<ModelBase<Model>, "userId"> = Omit<ModelBase<Model>, "userId">,
> {
	protected constructor(
		private readonly idb: IDB,
		public readonly storeName: string,
		public readonly primaryKey: string,
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

	public async getAll(userId: string): Promise<Model[]> {
		const records = (await this.idb.getAll(this.storeName)).filter(
			(record) => record.userId === userId,
		);
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

	public async save(
		userId: string,
		record: Partial<ModelWithoutUserId>,
		logOperation: boolean = true,
	): Promise<Model> {
		const operationType: Log["operationType"] = record.id ? "update" : "create";

		const finalRecord = {
			...record,
			userId,
			id: record.id || this.generateUniquePrimaryKey(),
		};
		if (!this.matchesModel(finalRecord)) {
			throw new Error(
				`Tried to save invalid record for ${this.storeName}: ${JSON.stringify(record)}`,
			);
		}

		await this.idb.transaction(["logs", this.storeName], async (transaction) => {
			if (logOperation) {
				// Get original record
				let recordForLog: Partial<Model> = finalRecord;
				if (record.id) {
					const originalRecord = await transaction.get(this.storeName, finalRecord.id);
					if (originalRecord) {
						recordForLog = {};
						for (const [key, val] of Object.entries(finalRecord)) {
							if (val !== originalRecord[key]) {
								recordForLog[key] = val;
							}
						}
					}
				}

				// Log operation
				await this.logOperation(
					userId,
					finalRecord[this.primaryKey],
					recordForLog,
					operationType,
					transaction,
				);
			}

			// Save record
			await transaction.put(this.storeName, finalRecord);
		});

		if (logOperation) {
			SyncWorker.getInstance().setDirty();
		}

		return finalRecord;
	}

	public async delete(
		userId: string,
		recordIds: string[],
		logOperation: boolean = true,
	): Promise<void> {
		await this.idb.transaction(["logs", this.storeName], async (transaction) => {
			for (const recordId of recordIds) {
				if (logOperation && this.storeName !== "logs") {
					// Log operation
					await this.logOperation(userId, recordId, null, "delete", transaction);
				}

				// Delete record
				await transaction.delete(this.storeName, recordId);
			}
		});

		if (logOperation) {
			SyncWorker.getInstance().setDirty();
		}
	}

	private async logOperation(
		userId: string,
		recordId: string,
		recordData: Partial<Model> | null,
		operationType: "create" | "update" | "delete",
		transaction: IDBTransactionWrapper<string>,
	) {
		const logIdKey = this.getLogIdKey();
		if (logIdKey) {
			let recordDataForLog: Partial<Model> | null = null;
			if (recordData) {
				recordDataForLog = { ...recordData };
				delete recordDataForLog.userId;
				delete recordDataForLog.id;
			}
			const log = {
				userId,
				id: createId(),
				[logIdKey]: recordId,
				operationType: operationType,
				data: recordDataForLog === null ? null : JSON.stringify(recordDataForLog),
				executedAt: new Date(),
				pushedAt: null,
			};
			console.log(log);
			if (!this.idb.log.matchesModel(log)) {
				throw new Error("Log data doesn't match model");
			}
			await transaction.put("logs", log);
		}
	}

	protected abstract generateUniquePrimaryKey(): string;
	protected abstract getDrizzleModel(): Record<keyof OmitServerFields<Model>, unknown>;
	protected abstract getLogIdKey(): (keyof Log & string & "memberId") | null;

	private matchesModel<M>(record: Partial<ModelBase<M>>): record is Model {
		const keys: string[] = [];
		for (const [key, column] of Object.entries(this.getDrizzleModel())) {
			if (!this.isColumn(column)) {
				continue;
			}

			keys.push(key);

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

			if (column.dataType === "string enum") {
				if (typeof record[key] === "string" && column.enumValues?.includes(record[key])) {
					continue;
				} else {
					console.log(key, record[key], column);
					return false;
				}
			}

			if (column.dataType === "object json") {
				if (typeof record[key] === "string") {
					try {
						JSON.parse(record[key]);
					} catch {
						console.log(key, record[key], column);
						return false;
					}
					continue;
				} else {
					console.log(key, record[key], column);
					return false;
				}
			}

			if (record[key] !== null && typeof record[key] !== column.dataType) {
				console.log(key, record[key], column);
				return false;
			}
		}

		const extraKey = Object.keys(record).find((key) => !keys.includes(key));
		if (extraKey) {
			console.log(extraKey, "in", record);
			return false;
		}

		return true;
	}

	private matchesModelArray<M>(records: ModelBase<M>[]): records is Model[] {
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
