import { type DBColumn, IDBModel } from "$lib/idb/IDBModel";
import { IDB } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import { type Log, logs } from "openselves-common/db";

export type ClientLog = Omit<Log, "memberId" | "deletedId" | "pushedAt"> & {
	memberId: string;
};

export class IDBLog extends IDBModel<ClientLog> {
	public constructor(idb: IDB) {
		super(idb, "logs", "id");
	}

	protected generateUniquePrimaryKey(): ClientLog["id"] {
		return createId();
	}

	protected getDrizzleModel(): Record<keyof ClientLog, DBColumn> {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { deletedId, pushedAt, ...baseModel } = this.stripDrizzleFromModel(logs);
		const clientLogs: Record<keyof ClientLog, DBColumn> = baseModel;
		clientLogs.memberId = {
			notNull: true,
			dataType: clientLogs.memberId.dataType,
			enumValues: clientLogs.memberId.enumValues,
		};
		return clientLogs;
	}
}
