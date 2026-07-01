import { type EntryWrapper } from "../../../willow/index.js";
import { BaseSchema, EntryDataModel } from "../EntryDataModel.js";
import { SchemaBuilder } from "../schema-builder.js";
import type { Schema, SchemaCreate, SchemaStatic } from "../types.js";

export const MemberSchema = {
	...BaseSchema,
	name: SchemaBuilder.string().default(""),
	pronouns: SchemaBuilder.string().optional(),
	description: SchemaBuilder.string().optional(),
	color: SchemaBuilder.string().optional(),
	image: SchemaBuilder.string().optional(),
	isArchived: SchemaBuilder.boolean().default(false),
	archivedReason: SchemaBuilder.string().optional(),
} satisfies Schema;
export type MemberStatic = SchemaStatic<typeof MemberSchema>;
export type MemberCreate = SchemaCreate<typeof MemberSchema>;

export class Member extends EntryDataModel<typeof MemberSchema> implements MemberStatic {
	constructor(subspaceId: string, data?: MemberCreate, entries?: EntryWrapper[]) {
		super(MemberSchema, subspaceId, data, entries);
	}

	protected getPathPrefix(): string {
		return "/member";
	}

	public get name(): string {
		return this.get("name");
	}
	public get pronouns(): string | undefined {
		return this.get("pronouns");
	}
	public get description(): string | undefined {
		return this.get("description");
	}
	public get color(): string | undefined {
		return this.get("color");
	}
	public get image(): string | undefined {
		return this.get("image");
	}
	public get isArchived(): boolean {
		return this.get("isArchived");
	}
	public get archivedReason(): string | undefined {
		return this.get("archivedReason");
	}
}
