import { type EntryWrapper } from "../../../willow/index.js";
import { BaseSchema, EntryDataModel } from "../EntryDataModel.js";
import { SchemaBuilder } from "../schema-builder.js";
import type { SchemaCreate, SchemaStatic, SchemaType } from "../types.js";

export const FrontSchema = {
	...BaseSchema,
	memberId: SchemaBuilder.string().required().nullable().default(null),
	startedAt: SchemaBuilder.date()
		.required()
		.default(() => new Date()),
	endedAt: SchemaBuilder.date().required().nullable().default(null),
	note: SchemaBuilder.string(),
} satisfies SchemaType;
export type FrontStatic = SchemaStatic<typeof FrontSchema>;
export type FrontCreate = SchemaCreate<typeof FrontSchema>;

export class Front extends EntryDataModel<typeof FrontSchema> {
	public static getModelKey(): string {
		return "front";
	}

	constructor(subspaceId: string, from: FrontCreate | EntryWrapper[]) {
		super(FrontSchema, subspaceId, from);
	}
}
