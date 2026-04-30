import {
	BadRequestException,
	ConflictException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createId } from "@paralleldrive/cuid2";
import { DrizzleQueryError, SQL, and, eq, inArray, sql } from "drizzle-orm";
import { PgAsyncTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import {
	type Front,
	type FrontCreate,
	type Log,
	type Member,
	type MemberCreate,
	type User,
	fronts,
	logs,
	members,
	models,
	type relations,
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

type SyncedModelParams<T extends TableMap = TableMap> = {
	name: T["table"];
	table: (typeof models)[T["table"]];
	modelIdLogKey: keyof (typeof models)["logs"] & T["modelIdLogKey"];
};
type SyncedModels<T extends TableMap = TableMap> = Record<T["table"], SyncedModelParams<T>>;

/**
 * !!ORDER MATTERS!!
 * Must be ordered by cascade delete dependency so that deleting from next model won't cascade
 * delete from previous model.
 */
export const syncedModels: SyncedModels = {
	members: {
		name: "members",
		table: members,
		modelIdLogKey: "memberId",
	},
	fronts: {
		name: "fronts",
		table: fronts,
		modelIdLogKey: "frontId",
	},
};

type LogToSave<Op extends OperationType = OperationType> = Omit<
	PushLogDto<Op>,
	"memberId" | "frontId" | "deletedId" | "pushedAt"
> & {
	memberId: Op["recordId"];
	frontId: Op["recordId"];
	deletedId: Op["deletedId"];
};
type Transaction = PgAsyncTransaction<PostgresJsQueryResultHKT, typeof models, typeof relations>;

type TableMap =
	| {
			table: "members";
			data: Omit<MemberCreate, "userId">;
			deleteId: Member["id"];
			modelIdLogKey: "memberId";
	  }
	| {
			table: "fronts";
			data: Omit<FrontCreate, "userId">;
			deleteId: Front["id"];
			modelIdLogKey: "frontId";
	  };
type UpdateData<Type> = Partial<Omit<Type, "userId" | "id" | "createdAt" | "updatedAt">>;

type RecordsToCreate<T extends TableMap = TableMap> = {
	[P in T["table"]]?: T["data"][];
};
type RecordsToUpdate<T extends TableMap = TableMap> = {
	[P in T["table"]]?: {
		id: Member["id"];
		data: UpdateData<T["data"]>;
	}[];
};
type RecordsToDelete<T extends TableMap = TableMap> = {
	[P in T["table"]]?: T["deleteId"][];
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

				const { logsToSave, recordsToCreate, recordsToUpdate, recordsToDelete } =
					await this.computeOperations(tx, userId, logDtos, alreadyPushedLogs);

				if (logsToSave.length === 0) {
					return;
				}

				await this.uploadLogAttachments(userId, logsToSave, attachments, async () => {
					await this.tryCreateRecords(tx, userId, recordsToCreate);
					await this.tryUpdateRecords(tx, userId, recordsToUpdate);
					await this.tryDeleteRecords(tx, userId, recordsToDelete);

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
				});
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
		let logsToSave: LogToSave[] = logDtos
			.filter((log) => !alreadyPushedLogs.find((existingLog) => log.id === existingLog.id))
			.map((log) => {
				if (log.operationType === "create") {
					const logDto = log as PushLogDto<CreateOperation>;
					const logToSave: LogToSave<CreateOperation> = {
						memberId: null,
						frontId: null,
						...logDto,
						deletedId: null,
					};
					return logToSave;
				}
				if (log.operationType === "update") {
					const logDto = log as PushLogDto<UpdateOperation>;
					const logToSave: LogToSave<UpdateOperation> = {
						memberId: null,
						frontId: null,
						...logDto,
						deletedId: null,
					};
					return logToSave;
				}
				if (log.operationType === "delete") {
					const logDto = log as PushLogDto<DeleteOperation>;

					let model: SyncedModelParams | undefined;
					if (logDto.memberId) {
						model = syncedModels.members;
					}
					if (logDto.frontId) {
						model = syncedModels.fronts;
					}
					if (!model) {
						throw new InternalServerErrorException("logDto has no recordId");
					}

					const deletedId = model.name + "." + logDto[model.modelIdLogKey];
					const logToSave: LogToSave<DeleteOperation> = {
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
				logsToSave
					.filter((log) => log.operationType === "update")
					.map((log) => {
						const inferredLog = log as LogToSave<UpdateOperation>;
						if (inferredLog.memberId) {
							return inferredLog.memberId;
						}
						if (inferredLog.frontId) {
							return inferredLog.frontId;
						}
						throw new InternalServerErrorException("Missing record id");
					}),
			),
		];
		const existingUpdateLogs: Log[] = await tx.query.logs.findMany({
			where: {
				userId,
				operationType: "update",
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

		for (const model of Object.values(syncedModels)) {
			// Skip update and delete logs for already deleted records
			const recordIdsToUpdateOrDelete = logsToSave
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
				logsToSave = logsToSave.filter((log) => {
					const id = log[model.modelIdLogKey]
						? `${model.name}.${log[model.modelIdLogKey]}`
						: log.deletedId;
					return !alreadyDeletedRecordIds.find((deletedId) => deletedId === id);
				});
			}

			// Resolve update logs conflicts
			const mergedHistory: {
				logToSave?: LogToSave<UpdateOperation>;
				dbLog?: Log;
				recordId: string;
				data: Record<string, unknown>;
				executedAt: Date;
			}[] = [
				...logsToSave
					.filter((log) => log.operationType === "update" && log[model.modelIdLogKey])
					.map((log) => {
						const inferredLog = log as LogToSave<UpdateOperation>;
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
				...existingUpdateLogs.map((log) => ({
					dbLog: log,
					recordId: log[model.modelIdLogKey] as string,
					data: log.data as Record<string, unknown>,
					executedAt: log.executedAt,
				})),
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
				for (const key of Object.keys(dataTracker.data)) {
					delete step.data[key];
				}
				dataTracker.data = Object.assign({ ...step.data }, dataTracker.data);
			}
		}

		// Remove empty update logs
		logsToSave = logsToSave.filter(
			(log) =>
				log.operationType !== "update" ||
				Object.keys((log as LogToSave<UpdateOperation>).data).length > 0,
		);

		const recordsToCreate: RecordsToCreate = {};
		for (const log of logsToSave.filter((log) => log.operationType === "create")) {
			const inferredLog = log as LogToSave<CreateOperation>;

			const model: SyncedModelParams | undefined = Object.values(syncedModels).find(
				(model) => inferredLog[model.modelIdLogKey],
			);
			if (!model) {
				throw new InternalServerErrorException("Tried to create non-synced record");
			}

			let recordsToCreateArray = recordsToCreate[model.name];
			if (!recordsToCreateArray) {
				recordsToCreate[model.name] = recordsToCreateArray = [];
			}

			const recordId = inferredLog[model.modelIdLogKey];
			if (!recordId) {
				throw new InternalServerErrorException("recordId is null for member creation");
			}

			recordsToCreateArray.push({
				...inferredLog.data,
				id: recordId,
			});
		}

		const recordsToUpdate: RecordsToUpdate = {};
		for (const log of logsToSave.filter((log) => log.operationType === "update")) {
			const inferredLog = log as LogToSave<UpdateOperation>;

			const model: SyncedModelParams | undefined = Object.values(syncedModels).find(
				(model) => inferredLog[model.modelIdLogKey],
			);
			if (!model) {
				throw new InternalServerErrorException("Tried to update non-synced record");
			}

			let recordsToUpdateArray = recordsToUpdate[model.name];
			if (!recordsToUpdateArray) {
				recordsToUpdate[model.name] = recordsToUpdateArray = [];
			}

			const recordId = inferredLog[model.modelIdLogKey];
			if (!recordId) {
				throw new InternalServerErrorException("recordId is null for member creation");
			}

			recordsToUpdateArray.push({
				id: recordId,
				data: { ...inferredLog.data },
			});
		}

		const recordsToDelete: RecordsToDelete = {};
		for (const log of logsToSave.filter((log) => log.operationType === "delete")) {
			const inferredLog = log as LogToSave<DeleteOperation>;
			const [tableName, id] = inferredLog.deletedId.split(".");
			const model = Object.values(syncedModels).find((model) => model.name === tableName);
			if (!model) {
				throw new InternalServerErrorException("Tried to delete non-synced record");
			}
			let data = recordsToDelete[model.name];
			if (!data) {
				data = recordsToDelete[model.name] = [];
			}
			data.push(id);
		}

		return {
			logsToSave,
			recordsToCreate,
			recordsToUpdate,
			recordsToDelete,
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
				await tx
					.insert(model.table)
					.values(valuesToInsert.map((val) => ({ ...val, userId })));
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

				const recordToUpdateIds = [...new Set(updateData.map((data) => data.id))];
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
			}
		}
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

		this.mapLogDataAttachmentsUrls(logs);

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

	public getLogAttachmentKey(userId: string, logId: string, key: string) {
		return userId + "/" + logId + "/" + key;
	}

	private async uploadLogAttachments(
		userId: string,
		logsToSave: LogToSave[],
		attachments: Express.Multer.File[],
		callback: () => Promise<void>,
	) {
		await this.s3Service.transaction(async (tx) => {
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
							await tx.uploadFile(
								attachment,
								this.getLogAttachmentKey(userId, log.id, key),
							);
						}
					}
				}
			}

			await callback();
		});
	}

	private mapLogDataAttachmentsUrls(logs: Log[]) {
		const publicUrl = this.configService.getOrThrow("PUBLIC_URL", { infer: true });
		for (const log of logs) {
			if (log.data) {
				for (const [key, value] of Object.entries(log.data)) {
					if (typeof value === "string" && value.startsWith("attachment:")) {
						log.data[key] =
							publicUrl +
							"/attachment/" +
							this.getLogAttachmentKey(log.userId, log.id, key);
					}
				}
			}
		}
	}
}
