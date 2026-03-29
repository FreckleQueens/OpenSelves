import { ConflictException, Injectable } from "@nestjs/common";
import { DrizzleQueryError, inArray } from "drizzle-orm";
import { type Log, type Member, logs, members } from "openselves-common/db";

import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import { PushLogDto } from "./data/push.dto.js";

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
		const logsToSave: (Omit<PushLogDto, "pushedAt"> & {
			pushedAt: Date;
		})[] = logDtos
			.filter((log) => !existingLogs.find((existingLog) => log.id === existingLog.id))
			.map((log) => ({ ...log, pushedAt }));

		const membersToCreate: Member[] = logsToSave
			.filter((log) => log.operationType === "create")
			.map((log) => ({
				...log.data,
				userId,
			}));

		const outputLogs: Log[] = existingLogs;
		if (logsToSave.length > 0) {
			try {
				await this.db.transaction(async (tx) => {
					if (membersToCreate.length > 0) {
						await tx.insert(members).values(membersToCreate);
					}
					outputLogs.push(...(await tx.insert(logs).values(logsToSave).returning()));
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
