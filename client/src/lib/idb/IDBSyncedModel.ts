import { IDBModel } from "$lib/idb/IDBModel";
import { SyncWorker } from "$lib/idb/SyncWorker";
import { IDBTransactionWrapper, type ModelBase, type SyncedModelBase } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import { type ColumnType } from "drizzle-orm/column-builder";
import type { Log } from "openselves-common/db";

export type DBColumn = {
	dataType: ColumnType;
	notNull: boolean;
	enumValues: string[] | undefined;
};

export abstract class IDBSyncedModel<Model extends SyncedModelBase> extends IDBModel<Model> {
	public async saveSynced(
		userId: string,
		saveData: Partial<Omit<Model, "userId">>,
		logOperation: boolean = true,
	): Promise<Model> {
		const operationType: Log["operationType"] = saveData.id ? "update" : "create";

		const finalRecord: Model = await this.idb.transaction(
			["logs", this.storeName],
			async (transaction) => {
				let originalRecord: ModelBase | undefined;
				if (saveData.id) {
					originalRecord = await transaction.get(this.storeName, saveData.id);
				}

				const finalRecord = {
					...(originalRecord || {}),
					...saveData,
					userId,
				};
				if (!finalRecord.id) {
					finalRecord.id = this.generateUniquePrimaryKey();
				}
				if (!this.matchesModel(finalRecord)) {
					throw new Error(
						`Tried to save invalid record for ${this.storeName}: ${JSON.stringify(saveData)}`,
					);
				}

				if (logOperation) {
					// Get original record
					let recordForLog: Partial<Model> = finalRecord;
					if (originalRecord) {
						recordForLog = {};
						for (const [key, val] of Object.entries(finalRecord)) {
							if (val !== originalRecord[key]) {
								recordForLog[key] = val;
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

				return finalRecord;
			},
		);

		if (logOperation) {
			SyncWorker.getInstance().setHasPushBacklog();
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
			};
			if (!this.idb.log.matchesModel(log)) {
				throw new Error("Log data doesn't match model");
			}
			await transaction.put("logs", log);
		}
	}

	protected abstract getLogIdKey(): keyof Log & string & "memberId";
}
