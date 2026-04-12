import { type DBColumn } from "$lib/idb/IDBModel";
import { IDBSyncedModel } from "$lib/idb/IDBSyncedModel";
import { IDB } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import { type Front, type Log, fronts } from "openselves-common/db";

export class IDBFront extends IDBSyncedModel<Front> {
	public constructor(idb: IDB) {
		super(idb, "fronts", "id");
	}

	protected generateUniquePrimaryKey(): Front["id"] {
		return createId();
	}

	protected getDrizzleModel(): Record<keyof Front, DBColumn> {
		return this.stripDrizzleFromModel(fronts);
	}

	protected getLogIdKey(): keyof Log & string {
		return "frontId";
	}
}
