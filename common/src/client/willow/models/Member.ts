import { type EntryWrapper } from "../../../willow/index.js";
import { BaseSchema, EntryDataModel } from "../EntryDataModel.js";
import { SchemaBuilder } from "../schema-builder.js";
import type { SchemaCreate, SchemaStatic, SchemaType } from "../types.js";

export const MemberSchema = {
	...BaseSchema,
	name: SchemaBuilder.string().required().default(""),
	pronouns: SchemaBuilder.string(),
	description: SchemaBuilder.string(),
	color: SchemaBuilder.string(),
	image: SchemaBuilder.string(),
	isArchived: SchemaBuilder.boolean().required().default(false),
	archivedReason: SchemaBuilder.string(),
} satisfies SchemaType;
export type MemberStatic = SchemaStatic<typeof MemberSchema>;
export type MemberCreate = SchemaCreate<typeof MemberSchema>;

export class Member extends EntryDataModel<typeof MemberSchema> {
	public static getModelKey(): string {
		return "member";
	}

	constructor(subspaceId: string, from: MemberCreate | EntryWrapper[]) {
		super(MemberSchema, subspaceId, from);
	}
}
