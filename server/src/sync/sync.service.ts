import {
	BadRequestException,
	ConflictException,
	Injectable,
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
	type models,
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

type LogToSave<Op extends OperationType = OperationType> = Omit<PushLogDto<Op>, "pushedAt"> & {
	deletedId: Op["deletedId"];
};
type Transaction = PgAsyncTransaction<PostgresJsQueryResultHKT, typeof models, typeof relations>;

type MembersToCreate = MemberCreate[];
type MembersToUpdate = {
	id: Member["id"];
	data: Partial<Omit<MemberCreate, "userId" | "id" | "createdAt" | "updatedAt">>;
}[];
type RecordsToDelete = { table: string; id: string }[];

@Injectable()
export class SyncService {
	constructor(@InjectDb() private readonly db: DB) {}

	public async reduceAndSaveLogs(userId: string, logDtos: PushLogDto[]): Promise<Log[]> {
		const pushedAt = new Date();

		let outputLogs: Log[] = [];
		try {
			await this.db.transaction(async (tx) => {
				const existingLogs: Log[] = await tx.query.logs.findMany({
					where: {
						userId: userId,
						id: { in: logDtos.map((log) => log.id) },
					},
				});
				outputLogs = existingLogs;

				const {
					logsToSave,
					membersToCreate,
					membersToUpdate,
					recordsToDelete,
					membersToDeleteIds,
				} = this.computeOperations(logDtos, userId, existingLogs);

				if (logsToSave.length === 0) {
					return;
				}

				if (membersToCreate.length > 0) {
					await tx.insert(members).values(membersToCreate);
				}
				if (membersToUpdate.length > 0) {
					await this.tryUpdateMembers(tx, userId, membersToUpdate);
				}
				if (membersToDeleteIds.length > 0) {
					outputLogs = await this.tryDeleteMembers(
						tx,
						userId,
						membersToDeleteIds,
						recordsToDelete,
						outputLogs,
					);
				}
				const values = logsToSave.map((log) => ({ ...log, userId, pushedAt }));
				outputLogs.push(...(await tx.insert(logs).values(values).returning()));
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

	private computeOperations(logDtos: PushLogDto[], userId: string, existingLogs: Log[]) {
		const logsToSave: LogToSave[] = logDtos
			.filter((log) => !existingLogs.find((existingLog) => log.id === existingLog.id))
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

		const membersToCreate: MembersToCreate = logsToSave
			.filter((log) => log.operationType === "create")
			.map((log: LogToSave) => {
				const inferredLog = log as LogToSave<CreateOperation>;
				return {
					...inferredLog.data,
					userId,
					id: inferredLog.memberId,
				};
			});
		const membersToUpdate: MembersToUpdate = logsToSave
			.filter((log) => log.operationType === "update")
			.map((log: LogToSave) => {
				const inferredLog = log as LogToSave<UpdateOperation>;
				return {
					id: inferredLog.memberId,
					data: { ...inferredLog.data },
				};
			});
		const recordsToDelete: RecordsToDelete = logsToSave
			.filter((log) => log.operationType === "delete")
			.map((log) => {
				const inferredLog = log as LogToSave<DeleteOperation>;
				const [table, id] = inferredLog.deletedId.split(".");
				return { table, id };
			});
		const membersToDeleteIds = recordsToDelete
			.filter((entry) => entry.table === "members")
			.map((entry) => entry.id);
		return {
			logsToSave,
			membersToCreate,
			membersToUpdate,
			recordsToDelete,
			membersToDeleteIds,
		};
	}

	private async tryUpdateMembers(
		tx: Transaction,
		userId: string,
		membersToUpdate: MembersToUpdate,
	) {
		const fields: Record<string, SQL[]> = {};
		for (const { id, data } of membersToUpdate) {
			for (const field of Object.keys(data)) {
				if (data[field] !== undefined) {
					if (!fields[field]) {
						fields[field] = [];
					}
					fields[field].push(sql`when ${members.id} = ${id} then ${data[field]}`);
				}
			}
		}

		const updatedMembers = await tx
			.update(members)
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
					eq(members.userId, userId),
					inArray(
						members.id,
						membersToUpdate.map((data) => data.id),
					),
				),
			)
			.returning();

		if (updatedMembers.length !== membersToUpdate.length) {
			throw new NotFoundException("Some members were not found");
		}
	}

	private async tryDeleteMembers(
		tx: Transaction,
		userId: string,
		membersToDeleteIds: string[],
		recordsToDelete: {
			table: string;
			id: string;
		}[],
		outputLogs: Log[],
	) {
		const deletedMembers = await tx
			.delete(members)
			.where(and(eq(members.userId, userId), inArray(members.id, membersToDeleteIds)))
			.returning();
		if (deletedMembers.length !== recordsToDelete.length) {
			const alreadyDeletedMemberIds = membersToDeleteIds.filter(
				(id) => !deletedMembers.find((member) => member.id === id),
			);
			const existingDeletionLogs = await tx
				.select()
				.from(logs)
				.where(
					and(
						eq(logs.userId, userId),
						inArray(
							logs.deletedId,
							alreadyDeletedMemberIds.map((id) => `members.${id}`),
						),
					),
				);
			if (existingDeletionLogs.length !== alreadyDeletedMemberIds.length) {
				throw new NotFoundException("Some members were not found");
			} else {
				outputLogs = outputLogs.filter(
					(log) =>
						!(
							log.operationType === "delete" &&
							alreadyDeletedMemberIds.includes(
								(log as LogToSave<DeleteOperation>).deletedId,
							)
						),
				);
				outputLogs.push(...existingDeletionLogs);
			}
		}
		return outputLogs;
	}
}
