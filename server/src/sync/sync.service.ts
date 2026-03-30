import { ConflictException, Injectable } from "@nestjs/common";
import { DrizzleQueryError, inArray } from "drizzle-orm";
import { type Log, type Member, logs, members } from "openselves-common/db";

import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import { PushLogDto, PushMemberDto } from "./data/push.dto.js";

type LogToSave = Omit<Omit<Omit<PushLogDto, "pushedAt">, "memberId">, "data"> & {
	memberId: PushLogDto["memberId"] | null;
	data: PushLogDto["data"] | { id: string };
};

@Injectable()
export class SyncService {
	constructor(@InjectDb() private readonly db: DB) {}

	public async reduceAndSaveLogs(logDtos: PushLogDto[], userId: string) {
		const pushedAt = new Date();

		const existingLogs: Log[] = await this.db
			.select()
			.from(logs)
			.where(
				inArray(
					logs.id,
					logDtos.map((log) => log.id),
				),
			);
		const logsToSave: LogToSave[] = logDtos
			.filter((log) => !existingLogs.find((existingLog) => log.id === existingLog.id))
			.map((log) => {
				const newLog: LogToSave = { ...log };
				if (log.operationType === "delete") {
					newLog.data = { id: log.memberId };
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
		const membersToDeleteIds: string[] = logsToSave
			.filter((log) => log.operationType === "delete")
			.map((log) => log.data.id);

		const outputLogs: Log[] = existingLogs;
		if (logsToSave.length > 0) {
			try {
				await this.db.transaction(async (tx) => {
					if (membersToCreate.length > 0) {
						await tx.insert(members).values(membersToCreate);
					}
					if (membersToDeleteIds.length > 0) {
						await tx.delete(members).where(inArray(members.id, membersToDeleteIds));
					}
					const values = logsToSave.map((log) => ({ ...log, pushedAt }));
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
