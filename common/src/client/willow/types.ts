import type { PartialBy } from "../../type-utils.js";

export type SupportedFieldTypeNames = "string" | "boolean" | "number" | "Date";
export type GetBaseType<BaseTypeName extends SupportedFieldTypeNames> =
	BaseTypeName extends "string"
		? string
		: BaseTypeName extends "boolean"
			? boolean
			: BaseTypeName extends "number"
				? number
				: BaseTypeName extends "Date"
					? Date
					: never;
export type SupportedValueTypes = GetBaseType<SupportedFieldTypeNames>;
export type SchemaField<
	BaseTypeName extends SupportedFieldTypeNames,
	Optional extends boolean,
	Nullable extends boolean,
	HasDefault extends boolean,
> = {
	baseTypeName: BaseTypeName;
	isOptional: Optional;
	isNullable: Nullable;
	hasDefault: HasDefault;
	getDefault: () => ConstructSchemaFieldType<BaseTypeName, Optional, Nullable> | undefined;
};
type Optional<T, IsOptional extends boolean> = IsOptional extends true ? T | undefined : T;
type Nullable<T, IsNullable extends boolean> = IsNullable extends true ? T | null : T;
export type ConstructSchemaFieldType<
	BaseTypeName extends SupportedFieldTypeNames,
	IsOptional extends boolean,
	IsNullable extends boolean,
> = Optional<Nullable<GetBaseType<BaseTypeName>, IsNullable>, IsOptional>;

export type Schema = Record<
	string,
	SchemaField<SupportedFieldTypeNames, boolean, boolean, boolean>
>;
export type SchemaStatic<Fields extends Schema> = {
	[K in keyof Fields]: ConstructSchemaFieldType<
		Fields[K]["baseTypeName"],
		Fields[K]["isOptional"],
		Fields[K]["isNullable"]
	>;
};
type SchemaKeysWithDefault<Fields extends Schema> = keyof {
	[K in keyof Fields]: Fields[K]["hasDefault"] extends true ? true : never;
};
export type SchemaCreate<Fields extends Schema> = PartialBy<
	SchemaStatic<Fields>,
	SchemaKeysWithDefault<Fields>
>;
