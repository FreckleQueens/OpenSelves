import { type DBColumn, IDBModel } from "$lib/idb/IDBModel";
import { IDB } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import { type Log, logs } from "openselves-common/db";

export type ClientLog = Omit<Log, "deletedId" | "pushedAt" | "memberId" | "frontId"> & {
	memberId?: string;
	frontId?: string;
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
		return baseModel;
	}
}
