import { type EntryWrapper } from "../../../willow/index.js";
import { BaseSchema, EntryDataModel } from "../EntryDataModel.js";
import { SchemaBuilder } from "../schema-builder.js";
import type { SchemaCreate, SchemaStatic, SchemaType } from "../types.js";

export const MemberSchema = {
	...BaseSchema,
	name: SchemaBuilder.string().default(""),
	pronouns: SchemaBuilder.string().optional(),
	description: SchemaBuilder.string().optional(),
	color: SchemaBuilder.string().optional(),
	image: SchemaBuilder.string().optional(),
	isArchived: SchemaBuilder.boolean().default(false),
	archivedReason: SchemaBuilder.string().optional(),
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
