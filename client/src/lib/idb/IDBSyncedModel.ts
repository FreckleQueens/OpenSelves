import type { ClientLog } from "$lib/idb/IDBLog";
import { IDBModel } from "$lib/idb/IDBModel";
import { SyncWorker } from "$lib/idb/SyncWorker.svelte";
import { IDBTransactionWrapper, type ModelBase, type SyncedModelBase } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import { type ColumnType } from "drizzle-orm/column-builder";
import type { Log } from "openselves-common/db";

export type DBColumn = {
	dataType: ColumnType;
	notNull: boolean;
	enumValues: string[] | undefined;
};

export class IDBSyncedModelEvent<Model extends SyncedModelBase> {
	constructor(
		public readonly savedRecords: Model[],
		public readonly deletedRecordIds: Model["id"][],
	) {}
}

export abstract class IDBSyncedModel<Model extends SyncedModelBase> extends IDBModel<Model> {
	private readonly subscriptions: Set<(event: IDBSyncedModelEvent<Model>) => void> = new Set();

	public subscribe(callback: (event: IDBSyncedModelEvent<Model>) => void) {
		this.subscriptions.add(callback);
		return callback;
	}

	public unsubscribe(callback: (event: IDBSyncedModelEvent<Model>) => void) {
		this.subscriptions.delete(callback);
	}

	public async saveSynced(
		userId: string,
		saveData: Partial<Omit<Model, "userId">>,
		logOperation: boolean = true,
	): Promise<Model> {
		const operationType: Log["operationType"] = saveData.id ? "update" : "create";

		if (Object.keys(saveData).length === 0) {
			throw new Error("Tried to save a model with no changes");
		}

		saveData.updatedAt = new Date();

		const finalRecord: Model = await this.idb.transaction(
			["logs", this.storeName],
			async (transaction) => {
				let originalRecord: ModelBase | undefined;
				if (saveData.id) {
					originalRecord = await transaction.get(this.storeName, saveData.id);
				}

				const fullRecordData = {
					...(originalRecord || {}),
					...saveData,
					userId,
				};
				if (!fullRecordData.id) {
					fullRecordData.id = this.generateUniquePrimaryKey();
				}
				const finalRecord = this.parseModel(fullRecordData);

				if (JSON.stringify(finalRecord) === JSON.stringify(originalRecord)) {
					return finalRecord;
				}

				if (logOperation) {
					// Get original record
					let recordForLog: Partial<Model> = finalRecord;
					if (originalRecord) {
						recordForLog = {};
						for (const [key, newValue] of Object.entries(finalRecord)) {
							const originalValue = originalRecord[key];
							let isDifferent = newValue !== originalValue;
							if (newValue instanceof Date && originalValue instanceof Date) {
								isDifferent =
									newValue.toISOString() !== originalValue.toISOString();
							}
							if (isDifferent) {
								recordForLog[key] = newValue;
							}
						}
					}

					if (Object.keys(recordForLog).length === 0) {
						throw new Error("Tried to log a record update with no changes");
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

				return finalRecord;
			},
		);

		if (logOperation) {
			SyncWorker.getInstance().setHasPushBacklog();
		}

		for (const callback of this.subscriptions) {
			callback(new IDBSyncedModelEvent<Model>([{ ...finalRecord }], []));
		}

		return finalRecord;
	}

	public async delete() {
		throw new Error("Use deleteSynced() instead");
	}

	public async deleteSynced(
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
			SyncWorker.getInstance().setHasPushBacklog();
		}

		for (const callback of this.subscriptions) {
			callback(new IDBSyncedModelEvent<Model>([], [...recordIds]));
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
			const logData: ClientLog = {
				userId,
				id: createId(),
				[logIdKey]: recordId,
				operationType: operationType,
				data: recordDataForLog === null ? null : JSON.stringify(recordDataForLog),
				executedAt: new Date(),
			};
			const log = this.idb.log.parseModel(logData);
			await transaction.put("logs", log);
		}
	}

	protected abstract getLogIdKey(): keyof Log & string;
}
