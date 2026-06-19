import {
	BadRequestException,
	ConflictException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createId } from "@paralleldrive/cuid2";
import { DrizzleQueryError, SQL, and, eq, inArray, or, sql } from "drizzle-orm";
import type { KeysMatching } from "openselves-common";
import {
	type Front,
	type Log,
	type Member,
	type Model,
	type ModelCreate,
	type ModelUpdate,
	type Transaction,
	type User,
	fronts,
	logs,
	members,
	models,
} from "openselves-common/db";

import type { ConfigData } from "../config.data.js";
import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import {
	type CreateOperation,
	type DeleteOperation,
	type OperationType,
	PushLogDto,
	type UpdateOperation,
} from "./data/push.dto.js";
import { S3Service } from "./s3.service.js";

export type SyncedModelCreate<K extends keyof typeof models> = Omit<ModelCreate<K>, "userId"> & {
	id: string;
};
export type SyncedModelUpdate<K extends keyof typeof models> = Omit<
	ModelUpdate<K>,
	"userId" | "id" | "createdAt" | "updatedAt"
>;

/**
 * !!ORDER MATTERS!!
 * Must be ordered by cascade delete dependency so that deleting from next model won't cascade
 * delete from previous model.
 */
export const syncedModels = {
	members: {
		name: "members",
		table: members,
		modelIdLogKey: "memberId",
		cascadeDeletes: {
			fronts: "memberId",
		},
	},
	fronts: {
		name: "fronts",
		table: fronts,
		modelIdLogKey: "frontId",
		cascadeDeletes: undefined,
	},
} satisfies {
	[M in keyof typeof models]?: {
		name: M;
		table: (typeof models)[M];
		modelIdLogKey: KeysMatching<Model<"logs">, string | null>;
		cascadeDeletes:
			| {
					[CM in Exclude<keyof typeof models, M>]?: KeysMatching<
						SyncedModelCreate<CM>,
						string
					>;
			  }
			| undefined;
	};
};

type LogOperation<Op extends OperationType = OperationType> = Omit<
	PushLogDto<Op>,
	"memberId" | "frontId" | "deletedId" | "pushedAt"
> & {
	memberId: Op["recordId"];
	frontId: Op["recordId"];
	deletedId: Op["deletedId"];
};

type RecordsToCreate = {
	[K in keyof typeof syncedModels]?: SyncedModelCreate<K>[];
};
type RecordsToUpdate = {
	[K in keyof typeof syncedModels]?: {
		id: Model<K>["id"];
		data: SyncedModelUpdate<K>;
	}[];
};
type RecordsToDelete = {
	[K in keyof typeof syncedModels]?: Model<K>["id"][];
};
type UserAttachment = {
	logId: string;
	dataKey: string;
};

type CascadeDeletesFromRecordIds = {
	[ForeignModel in keyof typeof syncedModels]?: {
		foreignKey: KeysMatching<SyncedModelCreate<ForeignModel>, string>;
		localIds: string[];
	};
};

@Injectable()
export class SyncService {
	constructor(
		@InjectDb() private readonly db: DB,
		private readonly configService: ConfigService<ConfigData>,
		private readonly s3Service: S3Service,
	) {}

	public async reduceAndSaveLogs(
		userId: string,
		logDtos: PushLogDto[],
		attachments: Express.Multer.File[],
	): Promise<void> {
		try {
			await this.db.transaction(async (tx) => {
				const alreadyPushedLogs: Log[] = await tx.query.logs.findMany({
					where: {
						userId: userId,
						id: { in: logDtos.map((log) => log.id) },
					},
				});

				const {
					logsToSave,
					recordsToCreate,
					recordsToUpdate,
					recordsToDelete,
					attachmentsToDelete,
				} = await this.computeOperations(tx, userId, logDtos, alreadyPushedLogs);

				if (logsToSave.length === 0) {
					return;
				}
				await this.tryCreateRecords(tx, userId, recordsToCreate);
				await this.tryUpdateRecords(tx, userId, recordsToUpdate);
				const deletedRecords = await this.tryDeleteRecords(tx, userId, recordsToDelete);
				for (const record of deletedRecords) {
					for (const [key, value] of Object.entries(record)) {
						if (typeof value === "string" && value.startsWith("attachment:")) {
							attachmentsToDelete.push({
								logId: value.slice("attachment:".length),
								dataKey: key,
							});
						}
					}
				}

				const savedLogs = await tx
					.insert(logs)
					.values(
						logsToSave.map((log) => ({
							...log,
							userId,
							pushedAt: sql`CURRENT_TIMESTAMP`,
						})),
					)
					.returning();

				if (savedLogs.length !== logsToSave.length) {
					throw new InternalServerErrorException("Not all logs were saved");
				}

				await this.handleLogAttachments(
					userId,
					logsToSave,
					attachments,
					attachmentsToDelete,
				);
			});
		} catch (error) {
			if (error instanceof DrizzleQueryError && error.cause?.["code"] === "23505") {
				throw new ConflictException(
					{
						message:
							"Some logs could not be committed to history due to already existing models",
					},
					{ cause: error },
				);
			}
			throw error;
		}
	}

	private async computeOperations(
		tx: Transaction,
		userId: string,
		logDtos: PushLogDto[],
		alreadyPushedLogs: Log[],
	) {
		const logs: LogOperation[] = logDtos
			.filter((log) => !alreadyPushedLogs.find((existingLog) => log.id === existingLog.id))
			.map((log) => {
				if (log.operationType === "create") {
					const logDto = log as PushLogDto<CreateOperation>;
					const logToSave: LogOperation<CreateOperation> = {
						memberId: null,
						frontId: null,
						...logDto,
						deletedId: null,
					};
					return logToSave;
				}
				if (log.operationType === "update") {
					const logDto = log as PushLogDto<UpdateOperation>;
					const logToSave: LogOperation<UpdateOperation> = {
						memberId: null,
						frontId: null,
						...logDto,
						deletedId: null,
					};
					return logToSave;
				}
				if (log.operationType === "delete") {
					const logDto = log as PushLogDto<DeleteOperation>;

					const model = Object.values(syncedModels).find(
						(model) => logDto[model.modelIdLogKey],
					);
					if (!model) {
						throw new InternalServerErrorException("logDto has no recordId");
					}

					const deletedId = model.name + "." + logDto[model.modelIdLogKey];
					const logToSave: LogOperation<DeleteOperation> = {
						...logDto,
						memberId: null,
						frontId: null,
						deletedId: deletedId,
					};
					return logToSave;
				}
				throw new BadRequestException(`Unknown log type`);
			});
		const recordsToUpdateIds = [
			...new Set(
				logs
					.filter((log) => log.operationType === "update")
					.map((log) => {
						const inferredLog = log as LogOperation<UpdateOperation>;
						const model = Object.values(syncedModels).find(
							(model) => inferredLog[model.modelIdLogKey],
						);
						const recordId = model ? inferredLog[model.modelIdLogKey] : null;
						if (!recordId) {
							throw new InternalServerErrorException("Missing record id");
						}
						return recordId;
					}),
			),
		];
		const existingDataLogs: Log[] = await tx.query.logs.findMany({
			where: {
				userId,
				operationType: {
					in: ["create", "update"],
				},
				OR: [
					{
						memberId: {
							in: recordsToUpdateIds,
						},
					},
					{
						frontId: {
							in: recordsToUpdateIds,
						},
					},
				],
			},
		});

		const { solvedLogs, attachmentsToDelete } = await this.solveHistory(
			tx,
			userId,
			logs,
			existingDataLogs,
		);

		// Remove empty update logs
		const filteredLogs = solvedLogs.filter(
			(log) =>
				log.operationType !== "update" ||
				Object.keys((log as LogOperation<UpdateOperation>).data).length > 0,
		);

		// Set attachments to log id
		const attachmentsProcessedLogs: LogOperation[] = filteredLogs.map((log) => {
			const outputLog = { ...log };
			if (outputLog.data) {
				outputLog.data = { ...outputLog.data };
				for (const [key, value] of Object.entries(outputLog.data)) {
					if (typeof value === "string" && value.startsWith("attachment:")) {
						outputLog.data[key] = "attachment:" + outputLog.id;
					}
				}
			}
			return outputLog;
		});

		const recordsToCreate = this.computeCreateOperations(attachmentsProcessedLogs);
		const recordsToUpdate = this.computeUpdateOperations(attachmentsProcessedLogs);
		const { cascadeDeletesFromRecordIds, recordsToDelete } =
			this.computeDeleteOperations(attachmentsProcessedLogs);

		const { filteredRecordsToCreate, filteredRecordsToUpdate, logsToSave } =
			await this.filterCascadeDeletedRecordsOperations(
				tx,
				cascadeDeletesFromRecordIds,
				recordsToCreate,
				recordsToUpdate,
				filteredLogs,
			);

		return {
			logsToSave,
			recordsToCreate: filteredRecordsToCreate,
			recordsToUpdate: filteredRecordsToUpdate,
			recordsToDelete,
			attachmentsToDelete,
		};
	}

	private async solveHistory(
		tx: Transaction,
		userId: string,
		logs: LogOperation[],
		existingDataLogs: Log[],
	) {
		const attachmentsToDelete: UserAttachment[] = [];
		let solvedLogs = logs;

		for (const model of Object.values(syncedModels)) {
			// Skip update and delete logs for already deleted records
			const recordIdsToUpdateOrDelete = solvedLogs
				.filter(
					(log) =>
						["update", "delete"].includes(log.operationType) &&
						(log[model.modelIdLogKey] || log.deletedId?.split(".")[0] === model.name),
				)
				.map((log) => {
					const id = log[model.modelIdLogKey] || log.deletedId?.split(".")[1];
					if (!id) {
						throw new InternalServerErrorException("Log contained not record id");
					}
					return id;
				});
			if (recordIdsToUpdateOrDelete.length > 0) {
				const alreadyDeletedRecordsLogs: Log[] = await tx.query.logs.findMany({
					where: {
						userId,
						deletedId: {
							in: recordIdsToUpdateOrDelete.map((id) => `${model.name}.${id}`),
						},
					},
				});
				const alreadyDeletedRecordIds = alreadyDeletedRecordsLogs.map((log) =>
					log[model.modelIdLogKey]
						? `${model.name}.${log[model.modelIdLogKey]}`
						: log.deletedId,
				);
				solvedLogs = solvedLogs.filter((log) => {
					const id = log[model.modelIdLogKey]
						? `${model.name}.${log[model.modelIdLogKey]}`
						: log.deletedId;
					return !alreadyDeletedRecordIds.find((deletedId) => deletedId === id);
				});
			}

			// Resolve update logs conflicts
			const mergedHistory: {
				logToSave?: LogOperation<UpdateOperation>;
				dbLog?: Log;
				recordId: string;
				data: Record<string, unknown>;
				executedAt: Date;
			}[] = [
				...solvedLogs
					.filter((log) => log.operationType === "update" && log[model.modelIdLogKey])
					.map((log) => {
						const inferredLog = log as LogOperation<UpdateOperation>;
						const recordId = inferredLog[model.modelIdLogKey];
						if (!recordId) {
							throw new InternalServerErrorException("recordId is null");
						}
						return {
							logToSave: inferredLog,
							recordId: recordId,
							data: inferredLog.data as unknown as Record<string, unknown>,
							executedAt: log.executedAt,
						};
					}),
				...existingDataLogs
					.filter((log) => log[model.modelIdLogKey])
					.map((log) => {
						const recordId = log[model.modelIdLogKey];
						if (!recordId) {
							throw new InternalServerErrorException("recordId is null");
						}
						return {
							dbLog: log,
							recordId,
							data: log.data as Record<string, unknown>,
							executedAt: log.executedAt,
						};
					}),
			].sort((step1, step2) => step2.executedAt.getTime() - step1.executedAt.getTime());
			const dataTrackers: Record<
				string,
				{
					data: Record<string, unknown>;
				}
			> = {};
			for (const step of mergedHistory) {
				let dataTracker = dataTrackers[step.recordId];
				if (!dataTracker) {
					dataTrackers[step.recordId] = dataTracker = {
						data: {},
					};
				}
				for (const key of Object.keys(step.data)) {
					if (step.data[key] === undefined) {
						delete step.data[key];
					}
				}
				for (const [key, value] of Object.entries(dataTracker.data)) {
					const oldValue = step.data[key];
					if (
						value !== oldValue &&
						typeof oldValue === "string" &&
						oldValue.startsWith("attachment:")
					) {
						const logId = step.dbLog?.id || step.logToSave?.id;
						if (!logId) {
							throw new InternalServerErrorException("No logId in history step", {
								cause: step,
							});
						}
						attachmentsToDelete.push({
							logId,
							dataKey: key,
						});
					}
					delete step.data[key];
				}
				dataTracker.data = Object.assign({ ...step.data }, dataTracker.data);
			}
		}
		return { solvedLogs, attachmentsToDelete };
	}

	private computeCreateOperations(attachmentsProcessedLogs: LogOperation[]) {
		const recordsToCreate: RecordsToCreate = {};
		const createLogs = attachmentsProcessedLogs.filter(
			(log) => log.operationType === "create",
		) as LogOperation<CreateOperation>[];
		for (const log of createLogs) {
			const model = Object.values(syncedModels).find((model) => log[model.modelIdLogKey]);
			if (!model) {
				throw new InternalServerErrorException("Tried to create non-synced record");
			}

			const recordId = log[model.modelIdLogKey];
			if (!recordId) {
				throw new InternalServerErrorException("recordId is null for member creation");
			}

			let modelRecordsToCreate = recordsToCreate[model.name] as SyncedModelCreate<
				keyof typeof syncedModels
			>[];
			if (!modelRecordsToCreate) {
				recordsToCreate[model.name] = modelRecordsToCreate = [];
			}

			modelRecordsToCreate.push({
				...log.data,
				id: recordId,
			});
		}
		return recordsToCreate;
	}

	private computeUpdateOperations(attachmentsProcessedLogs: LogOperation[]) {
		const recordsToUpdate: RecordsToUpdate = {};
		const updateLogs = attachmentsProcessedLogs.filter(
			(log) => log.operationType === "update",
		) as LogOperation<UpdateOperation>[];
		for (const log of updateLogs) {
			const model = Object.values(syncedModels).find((model) => log[model.modelIdLogKey]);
			if (!model) {
				throw new InternalServerErrorException("Tried to update non-synced record");
			}

			const recordId = log[model.modelIdLogKey];
			if (!recordId) {
				throw new InternalServerErrorException("recordId is null for member creation");
			}

			let recordsToUpdateArray = recordsToUpdate[model.name];
			if (!recordsToUpdateArray) {
				recordsToUpdate[model.name] = recordsToUpdateArray = [];
			}

			recordsToUpdateArray.push({
				id: recordId,
				data: { ...log.data },
			});
		}
		return recordsToUpdate;
	}

	private computeDeleteOperations(attachmentsProcessedLogs: LogOperation[]) {
		const cascadeDeletesFromRecordIds: CascadeDeletesFromRecordIds = {};

		const recordsToDelete: RecordsToDelete = {};
		const deleteLogs = attachmentsProcessedLogs.filter(
			(log) => log.operationType === "delete",
		) as LogOperation<DeleteOperation>[];
		for (const log of deleteLogs) {
			const [tableName, id] = log.deletedId.split(".");
			const model = Object.values(syncedModels).find((model) => model.name === tableName);
			if (!model) {
				throw new InternalServerErrorException("Tried to delete non-synced record");
			}

			let data = recordsToDelete[model.name];
			if (!data) {
				data = recordsToDelete[model.name] = [];
			}
			data.push(id);

			if (model.cascadeDeletes) {
				let foreignModelName: keyof typeof model.cascadeDeletes;
				for (foreignModelName in model.cascadeDeletes) {
					let cascadeDelete = cascadeDeletesFromRecordIds[foreignModelName];
					if (!cascadeDelete) {
						cascadeDelete = cascadeDeletesFromRecordIds[foreignModelName] = {
							foreignKey: model.cascadeDeletes[foreignModelName],
							localIds: [],
						};
					}

					cascadeDelete.localIds.push(id);
				}
			}
		}
		return { cascadeDeletesFromRecordIds, recordsToDelete };
	}

	private async filterCascadeDeletedRecordsOperations(
		tx: Transaction,
		cascadeDeletesFromRecordIds: CascadeDeletesFromRecordIds,
		recordsToCreate: RecordsToCreate,
		recordsToUpdate: RecordsToUpdate,
		logs: LogOperation[],
	) {
		let logsToSave = logs;
		const filteredRecordsToCreate = { ...recordsToCreate };
		const filteredRecordsToUpdate = { ...recordsToUpdate };

		let foreignModelName: keyof typeof cascadeDeletesFromRecordIds;
		for (foreignModelName in cascadeDeletesFromRecordIds) {
			const cascadeDelete = cascadeDeletesFromRecordIds[foreignModelName];
			if (!cascadeDelete) {
				continue;
			}

			const { foreignKey, localIds } = cascadeDelete;
			const foreignModel = syncedModels[foreignModelName];

			const modelRecordsToCreate = filteredRecordsToCreate[foreignModelName];
			if (modelRecordsToCreate) {
				const filteredRecordIds = modelRecordsToCreate
					.filter((record) => localIds.find((id) => id === record[foreignKey]))
					.map((record) => record.id);

				(
					filteredRecordsToCreate as Record<
						string,
						SyncedModelCreate<keyof typeof syncedModels>[]
					>
				)[foreignModelName] = modelRecordsToCreate.filter(
					(record) => !filteredRecordIds.includes(record.id),
				);
				logsToSave = logsToSave.filter((log) => {
					const logRecordId = log[foreignModel.modelIdLogKey];
					return !(
						log.operationType === "create" &&
						logRecordId &&
						filteredRecordIds.includes(logRecordId)
					);
				});
			}

			const modelRecordsToUpdate = recordsToUpdate[foreignModel.name] as Array<{
				id: string;
				data: SyncedModelUpdate<keyof typeof syncedModels>;
			}>;
			if (modelRecordsToUpdate) {
				const filteredRecordIds = (
					await tx
						.select()
						.from(foreignModel.table)
						.where(
							or(
								...localIds.map((id) =>
									and(
										eq(foreignModel.table[foreignKey], id),
										inArray(
											foreignModel.table.id,
											modelRecordsToUpdate.map((data) => data.id),
										),
									),
								),
							),
						)
				).map((record) => record.id);

				(
					filteredRecordsToUpdate as Record<
						string,
						{ id: string; data: SyncedModelUpdate<keyof typeof syncedModels> }[]
					>
				)[foreignModelName] = modelRecordsToUpdate.filter(
					(record) => !filteredRecordIds.includes(record.id),
				);
				logsToSave = logsToSave.filter((log) => {
					const logRecordId = log[foreignModel.modelIdLogKey];
					return !(
						log.operationType === "update" &&
						logRecordId &&
						filteredRecordIds.includes(logRecordId)
					);
				});
			}
		}

		return {
			filteredRecordsToCreate,
			filteredRecordsToUpdate,
			logsToSave,
		};
	}

	private async tryCreateRecords(
		tx: Transaction,
		userId: string,
		recordsToCreate: RecordsToCreate,
	) {
		for (const model of Object.values(syncedModels)) {
			const valuesToInsert = recordsToCreate[model.name];
			if (valuesToInsert && valuesToInsert.length > 0) {
				await tx.insert(model.table).values(
					valuesToInsert.map((val: SyncedModelCreate<keyof typeof syncedModels>) => ({
						...val,
						userId,
					})),
				);
			}
		}
	}

	private async tryUpdateRecords(
		tx: Transaction,
		userId: string,
		recordsToUpdate: RecordsToUpdate,
	) {
		for (const model of Object.values(syncedModels)) {
			const updateData = recordsToUpdate[model.name];
			if (updateData && updateData.length > 0) {
				const fields: Record<string, SQL[]> = {};
				for (const { id, data } of updateData) {
					for (const field of Object.keys(data)) {
						let value = data[field] as unknown;
						if (value !== undefined) {
							if (!fields[field]) {
								fields[field] = [];
							}
							if (value instanceof Date) {
								value = value.toISOString();
							}
							fields[field].push(sql`when ${model.table.id} = ${id} then ${value}`);
						}
					}
				}

				const recordToUpdateIds = [
					...new Set(updateData.map(({ id }: { id: string }) => id)),
				];
				const updatedRecords = await tx
					.update(model.table)
					.set(
						Object.fromEntries(
							Object.entries(fields).map(([field, sqlChunks]) => [
								field,
								sql.join(
									[
										sql`(case`,
										...sqlChunks,
										sql`else ${model.table[field]} end)`,
									],
									sql.raw(" "),
								),
							]),
						),
					)
					.where(
						and(
							eq(model.table.userId, userId),
							inArray(model.table.id, recordToUpdateIds),
						),
					)
					.returning();

				if (updatedRecords.length !== recordToUpdateIds.length) {
					throw new NotFoundException(`Some ${model.name} were not found`);
				}
			}
		}
	}

	private async tryDeleteRecords(
		tx: Transaction,
		userId: string,
		recordsToDelete: RecordsToDelete,
	) {
		const allDeletedRecords: Model<keyof typeof syncedModels>[] = [];
		for (const model of Object.values(syncedModels).reverse()) {
			const recordsToDeleteIds = recordsToDelete[model.name];
			if (recordsToDeleteIds && recordsToDeleteIds.length > 0) {
				const deletedRecords = await tx
					.delete(model.table)
					.where(
						and(
							eq(model.table.userId, userId),
							inArray(model.table.id, recordsToDeleteIds),
						),
					)
					.returning();

				if (deletedRecords.length !== recordsToDeleteIds.length) {
					const alreadyDeletedRecordIds = recordsToDeleteIds.filter(
						(id) => !deletedRecords.find((record) => record.id === id),
					);
					const existingDeletionLogs = await tx
						.select()
						.from(logs)
						.where(
							and(
								eq(logs.userId, userId),
								inArray(
									logs.deletedId,
									alreadyDeletedRecordIds.map((id) => `${model.name}.${id}`),
								),
							),
						);
					if (existingDeletionLogs.length !== alreadyDeletedRecordIds.length) {
						throw new NotFoundException(`Some ${model.name} were not found`);
					}
				}
				allDeletedRecords.push(...deletedRecords);
			}
		}

		return allDeletedRecords;
	}

	public async generateInitialSync(userId: User["id"]): Promise<{
		timestamp: number;
		logs: Log[];
	}> {
		const user = await this.db.query.users.findFirst({
			where: {
				id: userId,
			},
			with: {
				members: true,
				fronts: true,
				logs: true,
			},
			extras: {
				queryTime: sql`CURRENT_TIMESTAMP`,
			},
		});
		if (!user) {
			throw new InternalServerErrorException("User couldn't be retrieved from db");
		}
		if (typeof user.queryTime !== "string") {
			throw new InternalServerErrorException(
				"DB responded with invalid or missing queryTime",
			);
		}

		const logs: Log[] = [];

		const returnedTimestamp = new Date(user.queryTime);
		for (const model of Object.values(syncedModels)) {
			const records = user[model.name].map((record: Front | Member) => {
				const { id, userId, ...data } = record;
				const log: Log = {
					memberId: null,
					frontId: null,
					id: createId(),
					userId: user.id,
					[model.modelIdLogKey]: record.id,
					operationType: "create",
					data: data,
					deletedId: null,
					executedAt: returnedTimestamp,
					pushedAt: returnedTimestamp,
				};
				return log;
			});
			logs.push(...records);
		}

		logs.push(...user.logs.filter((log) => log.operationType === "delete"));

		this.mapLogDataAttachmentsUrls(logs, true);

		return {
			timestamp: returnedTimestamp.getTime(),
			logs,
		};
	}

	public async getLogsFrom(
		userId: User["id"],
		timestamp: number,
	): Promise<{
		timestamp: number;
		logs: Log[];
	}> {
		const logs = await this.db.query.logs.findMany({
			where: {
				userId,
				pushedAt: {
					gt: new Date(timestamp),
				},
			},
			orderBy: {
				pushedAt: "asc",
			},
			extras: {
				queryTime: sql`CURRENT_TIMESTAMP`,
			},
		});

		let returnedTimestamp = timestamp;
		if (logs.length > 0) {
			const queryTime = logs[logs.length - 1].queryTime;
			if (typeof queryTime !== "string") {
				throw new InternalServerErrorException(
					"DB responded with invalid or missing queryTime",
				);
			}
			returnedTimestamp = new Date(queryTime).getTime();
		}

		this.mapLogDataAttachmentsUrls(logs);

		return {
			timestamp: returnedTimestamp,
			logs: logs.map((log) => {
				const { queryTime, ...newLog } = log;
				return newLog;
			}),
		};
	}

	public getLogAttachmentKey(userId: string, logId: string, dataKey: string) {
		return userId + "/" + logId + "/" + dataKey;
	}

	private async handleLogAttachments(
		userId: string,
		logsToSave: LogOperation[],
		attachments: Express.Multer.File[],
		attachmentsToDelete: UserAttachment[],
	) {
		await this.s3Service.transaction((tx) => {
			for (const log of logsToSave) {
				if (log.data) {
					for (const [key, value] of Object.entries(log.data)) {
						if (typeof value === "string" && value.startsWith("attachment:")) {
							const attachmentName = value.split(":", 2)[1];
							const attachment = attachments.find(
								(attachment) => attachment.originalname === attachmentName,
							);
							if (!attachment) {
								throw new BadRequestException(
									"Log contained reference to attachment that was not uploaded: " +
										attachmentName,
								);
							}
							tx.queueUploadFile(
								attachment,
								this.getLogAttachmentKey(userId, log.id, key),
							);
						}
					}
				}
			}

			for (const attachment of attachmentsToDelete) {
				tx.queueDeleteFile(
					this.getLogAttachmentKey(userId, attachment.logId, attachment.dataKey),
				);
			}
		});
	}

	private mapLogDataAttachmentsUrls(logs: Log[], inferLogIdFromValue: boolean = false) {
		const publicUrl = this.configService.getOrThrow("PUBLIC_URL", { infer: true });
		for (const log of logs) {
			if (log.data) {
				for (const [key, value] of Object.entries(log.data)) {
					if (typeof value === "string" && value.startsWith("attachment:")) {
						const logId = inferLogIdFromValue ? value.split(":", 2)[1] : log.id;
						log.data[key] =
							publicUrl +
							"/attachment/" +
							this.getLogAttachmentKey(log.userId, logId, key);
					}
				}
			}
		}
	}
}
