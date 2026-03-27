import { IDBModel } from "$lib/idb/IDBModel";
import { IDB } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import type { PartialBy } from "openselves-common";
import { type Log, logs } from "openselves-common/db";

export type ClientLog = PartialBy<Log, "pushedAt">;
export class IDBLog extends IDBModel<ClientLog, "id", string> {
	public constructor(idb: IDB) {
		super(idb, "logs", "id");
	}

	protected generateUniquePrimaryKey(): ClientLog["id"] {
		return createId();
	}

	protected getDrizzleModel(): Record<keyof ClientLog, unknown> {
		const clientLogs: Record<keyof ClientLog, unknown> = { ...logs };
		clientLogs.pushedAt = { ...logs.pushedAt, notNull: false };
		return clientLogs;
	}

	protected getLogIdKey(): (keyof Log & string & "memberId") | null {
		return null;
	}
}
