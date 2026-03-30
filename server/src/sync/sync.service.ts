import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DrizzleQueryError, and, eq, inArray } from "drizzle-orm";
import { type Log, type Member, logs, members } from "openselves-common/db";

import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import { PushLogDto, PushMemberDto } from "./data/push.dto.js";

type LogToSave = Omit<Omit<Omit<PushLogDto, "pushedAt">, "memberId">, "data"> & {
	memberId: PushLogDto["memberId"] | null;
	data: PushLogDto["data"] | null;
	deletedId: string | null;
};

@Injectable()
export class SyncService {
	constructor(@InjectDb() private readonly db: DB) {}

	public async reduceAndSaveLogs(userId: string, logDtos: PushLogDto[]): Promise<Log[]> {
		const pushedAt = new Date();

		const existingLogs: Log[] = await this.db.query.logs.findMany({
			where: {
				userId: userId,
				id: { in: logDtos.map((log) => log.id) },
			},
		});

		const logsToSave: LogToSave[] = logDtos
			.filter((log) => !existingLogs.find((existingLog) => log.id === existingLog.id))
			.map((log) => {
				const newLog: LogToSave = { ...log, deletedId: null };
				if (log.operationType === "delete") {
					newLog.deletedId = `members.${log.memberId}`;
					newLog.memberId = null;
				}
				return newLog;
			});

		const membersToCreate: Member[] = logsToSave
			.filter((log) => log.operationType === "create")
			.map((log) => ({
				...(log.data as PushMemberDto), // Inferred by filter
				userId,
			}));
		const recordsToDelete: { table: string; id: string }[] = logsToSave
			.filter((log) => log.operationType === "delete")
			.map((log) => {
				const [table, id] = (log.deletedId as string).split(".");
				return { table, id };
			});
		const membersToDeleteIds = recordsToDelete
			.filter((entry) => entry.table === "members")
			.map((entry) => entry.id);

		let outputLogs: Log[] = existingLogs;
		if (logsToSave.length > 0) {
			try {
				await this.db.transaction(async (tx) => {
					if (membersToCreate.length > 0) {
						await tx.insert(members).values(membersToCreate);
					}
					if (membersToDeleteIds.length > 0) {
						const deletedMembers = await tx
							.delete(members)
							.where(
								and(
									eq(members.userId, userId),
									inArray(members.id, membersToDeleteIds),
								),
							)
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
												log.deletedId as string,
											)
										),
								);
								outputLogs.push(...existingDeletionLogs);
							}
						}
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
		}

		return outputLogs;
	}
}
