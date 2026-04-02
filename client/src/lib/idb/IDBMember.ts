import { type DBColumn } from "$lib/idb/IDBModel";
import { IDBSyncedModel } from "$lib/idb/IDBSyncedModel";
import { IDB } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import { type Log, type Member, members } from "openselves-common/db";

export class IDBMember extends IDBSyncedModel<Member> {
	public constructor(idb: IDB) {
		super(idb, "members", "id");
	}

	protected generateUniquePrimaryKey(): Member["id"] {
		return createId();
	}

	protected getDrizzleModel(): Record<keyof Member, DBColumn> {
		return this.stripDrizzleFromModel(members);
	}

	protected getLogIdKey(): keyof Log & string & "memberId" {
		return "memberId";
	}
}
