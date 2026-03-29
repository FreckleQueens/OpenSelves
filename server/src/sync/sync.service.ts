import { Injectable } from "@nestjs/common";
import { type Log, type Member, logs, members } from "openselves-common/db";

import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import type { PushLogDto } from "./data/push.dto.js";

@Injectable()
export class SyncService {
	constructor(@InjectDb() private readonly db: DB) {}

	public async reduceAndSaveLogs(logDtos: PushLogDto[]) {
		const pushedAt = new Date();
		const logsToSave: Log[] = [];
		const membersToSave: Member[] = [];

		for (const log of logDtos) {
			if (log.operationType === "create") {
				membersToSave.push(log.data);
			}
			logsToSave.push({ ...log, pushedAt });
		}

		let outputLogs: Log[] = [];
		await this.db.transaction(async (tx) => {
			if (membersToSave.length > 0) {
				await tx.insert(members).values(membersToSave);
			}
			outputLogs = await tx.insert(logs).values(logsToSave).returning();
		});
		return outputLogs;
	}
}
