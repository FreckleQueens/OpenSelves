import { type DBColumn, IDBModel } from "$lib/idb/IDBModel";
import { IDB, type ModelBase } from "$lib/idb/idb";

export type Attachment = ModelBase & {
	userId: string;
	id: string;
	file: Blob;
	dataUri: string;
};

export class IDBAttachment extends IDBModel<Attachment, "id"> {
	public constructor(idb: IDB) {
		super(idb, "attachments", "id");
	}

	protected getDrizzleModel(): Record<keyof Attachment, DBColumn> {
		return {
			userId: {
				dataType: "string",
				notNull: true,
				enumValues: undefined,
			},
			id: {
				dataType: "string",
				notNull: true,
				enumValues: undefined,
			},
			file: {
				dataType: "object buffer",
				notNull: true,
				enumValues: undefined,
			},
			dataUri: {
				dataType: "string",
				notNull: true,
				enumValues: undefined,
			},
		};
	}
}
