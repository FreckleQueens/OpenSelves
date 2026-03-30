import { IDBModel, type OmitServerFields } from "$lib/idb/IDBModel";
import { IDB } from "$lib/idb/idb";
import { createId } from "@paralleldrive/cuid2";
import { type Log, type Member, members } from "openselves-common/db";

export class IDBMember extends IDBModel<Member, "id", string> {
	public constructor(idb: IDB) {
		super(idb, "members", "id");
	}

	protected generateUniquePrimaryKey(): Member["id"] {
		return createId();
	}

	protected getDrizzleModel(): Record<keyof OmitServerFields<Member>, unknown> {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { userId, createdAt, updatedAt, ...model } = members;
		return model;
	}

	protected getLogIdKey(): keyof Log & string & "memberId" {
		return "memberId";
	}
}
