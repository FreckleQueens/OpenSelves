import {
	BadRequestException,
	ConflictException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from "@nestjs/common";
import { DrizzleQueryError, SQL, and, eq, inArray, sql } from "drizzle-orm";
import { PgAsyncTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import {
	type Log,
	type Member,
	type MemberCreate,
	logs,
	members,
	models,
	type relations,
} from "openselves-common/db";

import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import {
	type CreateOperation,
	type DeleteOperation,
	type OperationType,
	PushLogDto,
	type UpdateOperation,
} from "./data/push.dto.js";

type SyncedModels<T extends TableMap = TableMap> = Record<
	T["table"],
	{
		name: T["table"];
		table: (typeof models)[T["table"]];
		modelIdLogKey: keyof (typeof models)["logs"] & T["modelIdLogKey"];
	}
>;
const syncedModels: SyncedModels = {
	members: {
		name: "members",
		table: members,
		modelIdLogKey: "memberId",
	},
};

type LogToSave<Op extends OperationType = OperationType> = Omit<PushLogDto<Op>, "pushedAt"> & {
	deletedId: Op["deletedId"];
};
type Transaction = PgAsyncTransaction<PostgresJsQueryResultHKT, typeof models, typeof relations>;

type TableMap = {
	table: "members";
	data: Omit<MemberCreate, "userId">;
	deleteId: Member["id"];
	modelIdLogKey: "memberId";
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
	constructor(@InjectDb() private readonly db: DB) {}

	public async reduceAndSaveLogs(userId: string, logDtos: PushLogDto[]): Promise<Log[]> {
		const pushedAt = new Date();

		let outputLogs: Log[] = [];
		try {
			await this.db.transaction(async (tx) => {
				const alreadyPushedLogs: Log[] = await tx.query.logs.findMany({
					where: {
						userId: userId,
						id: { in: logDtos.map((log) => log.id) },
					},
				});
				outputLogs = alreadyPushedLogs;

				const {
					logsToSave,
					recordsToCreate,
					recordsToUpdate,
					recordsToDelete,
					outputLogs: computedOutputLogs,
				} = await this.computeOperations(tx, userId, logDtos, alreadyPushedLogs);
				outputLogs.push(...computedOutputLogs);

				if (logsToSave.length === 0) {
					return;
				}

				await this.tryCreateRecords(tx, userId, recordsToCreate);
				await this.tryUpdateRecords(tx, userId, recordsToUpdate);
				outputLogs = await this.tryDeleteRecords(tx, userId, recordsToDelete, outputLogs);

				const savedLogs = await tx
					.insert(logs)
					.values(logsToSave.map((log) => ({ ...log, userId, pushedAt })))
					.returning();
				outputLogs.push(...savedLogs);
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

		return outputLogs;
	}

	private async computeOperations(
		tx: Transaction,
		userId: string,
		logDtos: PushLogDto[],
		alreadyPushedLogs: Log[],
	) {
		const outputLogs: Log[] = [];

		let logsToSave: LogToSave[] = logDtos
			.filter((log) => !alreadyPushedLogs.find((existingLog) => log.id === existingLog.id))
			.map((log) => {
				if (log.operationType === "create") {
					const logDto = log as PushLogDto<CreateOperation>;
					const logToSave: LogToSave<CreateOperation> = {
						...logDto,
						deletedId: null,
					};
					return logToSave;
				}
				if (log.operationType === "update") {
					const logDto = log as PushLogDto<UpdateOperation>;
					const logToSave: LogToSave<UpdateOperation> = {
						...logDto,
						deletedId: null,
					};
					return logToSave;
				}
				if (log.operationType === "delete") {
					const logDto = log as PushLogDto<DeleteOperation>;
					const logToSave: LogToSave<DeleteOperation> = {
						...logDto,
						memberId: null,
						deletedId: "members." + logDto.memberId,
					};
					return logToSave;
				}
				throw new BadRequestException(`Unknown log type`);
			});

		for (const model of Object.values(syncedModels)) {
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
				outputLogs.push(...alreadyDeletedRecordsLogs);
			}
		}

		const recordsToCreate: RecordsToCreate = {};
		for (const log of logsToSave.filter((log) => log.operationType === "create")) {
			const inferredLog = log as LogToSave<CreateOperation>;
			if (inferredLog.memberId) {
				if (!recordsToCreate.members) {
					recordsToCreate.members = [];
				}
				recordsToCreate.members.push({
					...inferredLog.data,
					id: inferredLog.memberId,
				});
			} else {
				throw new InternalServerErrorException("Tried to create non-synced record");
			}
		}

		const recordsToUpdate: RecordsToUpdate = {};
		for (const log of logsToSave.filter((log) => log.operationType === "update")) {
			const inferredLog = log as LogToSave<UpdateOperation>;
			if (inferredLog.memberId) {
				if (!recordsToUpdate.members) {
					recordsToUpdate.members = [];
				}
				recordsToUpdate.members.push({
					id: inferredLog.memberId,
					data: { ...inferredLog.data },
				});
			} else {
				throw new InternalServerErrorException("Tried to update non-synced record");
			}
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
			outputLogs,
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
						if (data[field] !== undefined) {
							if (!fields[field]) {
								fields[field] = [];
							}
							fields[field].push(
								sql`when ${model.table.id} = ${id} then ${data[field]}`,
							);
						}
					}
				}

				const updatedRecords = await tx
					.update(model.table)
					.set(
						Object.fromEntries(
							Object.entries(fields).map(([field, sqlChunks]) => [
								field,
								sql.join([sql`(case`, ...sqlChunks, sql`end)`], sql.raw(" ")),
							]),
						),
					)
					.where(
						and(
							eq(model.table.userId, userId),
							inArray(
								model.table.id,
								updateData.map((data) => data.id),
							),
						),
					)
					.returning();

				if (updatedRecords.length !== updateData.length) {
					throw new NotFoundException(`Some ${model.name} were not found`);
				}
			}
		}
	}

	private async tryDeleteRecords(
		tx: Transaction,
		userId: string,
		recordsToDelete: RecordsToDelete,
		outputLogs: Log[],
	) {
		for (const model of Object.values(syncedModels)) {
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
					} else {
						outputLogs = outputLogs.filter(
							(log) =>
								!(
									log.operationType === "delete" &&
									alreadyDeletedRecordIds.includes(
										(log as LogToSave<DeleteOperation>).deletedId,
									)
								),
						);
						outputLogs.push(...existingDeletionLogs);
					}
				}
			}
		}
		return outputLogs;
	}
}
