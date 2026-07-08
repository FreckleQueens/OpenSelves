import type { PartialBy } from "../../type-utils.js";

export type SupportedSchemaFieldTypeNames = "string" | "boolean" | "number" | "Date";
export type GetBaseType<BaseTypeName extends SupportedSchemaFieldTypeNames> =
	BaseTypeName extends "string"
		? string
		: BaseTypeName extends "boolean"
			? boolean
			: BaseTypeName extends "number"
				? number
				: BaseTypeName extends "Date"
					? Date
					: never;
export type SupportedSchemaFieldTypes = GetBaseType<SupportedSchemaFieldTypeNames>;
export type SchemaValueTypes = SupportedSchemaFieldTypes | null | undefined;
export type SchemaField<
	BaseTypeName extends SupportedSchemaFieldTypeNames,
	Optional extends boolean,
	Nullable extends boolean,
	HasDefault extends boolean,
> = {
	baseTypeName: BaseTypeName;
	isOptional: Optional;
	isNullable: Nullable;
	hasDefault: HasDefault;
	isDefaultGenerated: boolean;
	isReadonly: boolean;
	getDefault: () => ConstructSchemaFieldType<BaseTypeName, Optional, Nullable> | undefined;
};
type Optional<T, IsOptional extends boolean> = IsOptional extends true ? T | undefined : T;
type Nullable<T, IsNullable extends boolean> = IsNullable extends true ? T | null : T;
export type ConstructSchemaFieldType<
	BaseTypeName extends SupportedSchemaFieldTypeNames,
	IsOptional extends boolean,
	IsNullable extends boolean,
> = Optional<Nullable<GetBaseType<BaseTypeName>, IsNullable>, IsOptional>;

export type SchemaType = Record<
	string,
	SchemaField<SupportedSchemaFieldTypeNames, boolean, boolean, boolean>
>;
export type KeyOfSchema<Schema extends SchemaType> = keyof Schema & string;
export type SchemaStatic<Schema extends SchemaType> = {
	[K in keyof Schema]: ConstructSchemaFieldType<
		Schema[K]["baseTypeName"],
		Schema[K]["isOptional"],
		Schema[K]["isNullable"]
	>;
};
type SchemaKeysWithDefault<Schema extends SchemaType> = keyof {
	[K in keyof Schema]: Schema[K]["hasDefault"] extends true ? true : never;
};
export type SchemaCreate<Schema extends SchemaType> = PartialBy<
	SchemaStatic<Schema>,
	SchemaKeysWithDefault<Schema>
>;
