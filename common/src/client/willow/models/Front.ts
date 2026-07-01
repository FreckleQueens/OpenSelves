import { type EntryWrapper } from "../../../willow/index.js";
import { BaseSchema, EntryDataModel } from "../EntryDataModel.js";
import { SchemaBuilder } from "../schema-builder.js";
import type { Schema, SchemaCreate, SchemaStatic } from "../types.js";

export const FrontSchema = {
	...BaseSchema,
	memberId: SchemaBuilder.string().nullable().default(null),
	startedAt: SchemaBuilder.date().default(() => new Date()),
	endedAt: SchemaBuilder.date().optional(),
	note: SchemaBuilder.string().optional(),
} satisfies Schema;
export type FrontStatic = SchemaStatic<typeof FrontSchema>;
export type FrontCreate = SchemaCreate<typeof FrontSchema>;

export class Front extends EntryDataModel<typeof FrontSchema> implements FrontStatic {
	constructor(subspaceId: string, data?: FrontCreate, entries?: EntryWrapper[]) {
		super(FrontSchema, subspaceId, data, entries);
	}

	protected getPathPrefix(): string {
		return "/front";
	}

	public get memberId(): string | null {
		return this.get("memberId");
	}
	public get startedAt(): Date {
		return this.get("startedAt");
	}
	public get endedAt(): Date | undefined {
		return this.get("endedAt");
	}
	public get note(): string | undefined {
		return this.get("note");
	}
}
