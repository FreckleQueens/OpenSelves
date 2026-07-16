import type { PartialBy } from "../type-utils.js";

type FieldPrimitiveTypes = string | number | boolean | Date | undefined | null;

export type FieldTypeTypes =
	| FieldPrimitiveTypes
	| RecordStatic<RecordType>
	| SchemaStatic<SchemaType>;
export type FieldTypeTypeData = FieldTypeTypes | RecordType | SchemaType | undefined;

export type FieldType<
	Name extends string = string,
	Type = FieldTypeTypes,
	TypeData = FieldTypeTypeData,
> = {
	readonly name: Name;
	readonly type?: Type;
	readonly typeData?: TypeData;
};

export type UndefinedFieldType = FieldType<"undefined", undefined>;
export const UndefinedFieldType: UndefinedFieldType = {
	name: "undefined",
};

export type NullFieldType = FieldType<"null", null>;
export const NullFieldType: NullFieldType = {
	name: "null",
};

export type StringFieldType = FieldType<"string", string>;
export const StringFieldType: StringFieldType = {
	name: "string",
};

export type BooleanFieldType = FieldType<"boolean", boolean>;
export const BooleanFieldType: BooleanFieldType = {
	name: "boolean",
};

export type NumberFieldType = FieldType<"number", number>;
export const NumberFieldType: NumberFieldType = {
	name: "number",
};

export type DateFieldType = FieldType<"Date", Date>;
export const DateFieldType: DateFieldType = {
	name: "Date",
};

export type RecordFieldType<Record extends RecordType = RecordType> = FieldType<
	"record",
	RecordStatic<Record>,
	Record
>;
export class RecordFieldTypeConstructor<
	Record extends RecordType = RecordType,
> implements RecordFieldType<Record> {
	public readonly name = "record";
	public constructor(public readonly typeData: Record) {}
}
export const RecordFieldType = RecordFieldTypeConstructor;

export type SchemaFieldType<Schema extends SchemaType = SchemaType> = FieldType<
	"schema",
	SchemaStatic<Schema>,
	Schema
>;
export class SchemaFieldTypeConstructor<
	Schema extends SchemaType = SchemaType,
> implements SchemaFieldType<Schema> {
	public readonly name = "schema";
	public constructor(public readonly typeData: Schema) {}
}
export const SchemaFieldType = SchemaFieldTypeConstructor;

export type FieldTypes =
	| UndefinedFieldType
	| NullFieldType
	| StringFieldType
	| BooleanFieldType
	| NumberFieldType
	| DateFieldType
	| RecordFieldType
	| SchemaFieldType;
export type FieldTypeValue<Field extends FieldType, IsNullable extends boolean = false> = Nullable<
	Field extends FieldType<string, infer T> ? T : never,
	IsNullable
>;
export type AnyFieldTypesValue = FieldTypeValue<FieldTypes>;

export type SchemaFieldInfo = {
	types: FieldType[];
	isOptional: boolean;
	isNullable: boolean;
	hasDefault: boolean;
	isDefaultGenerated: boolean;
	isReadonly: boolean;
	getDefault: () => AnyFieldTypesValue;
};
export type SchemaField<
	Field extends FieldType = FieldTypes,
	IsOptional extends boolean = boolean,
	IsNullable extends boolean = boolean,
	HasDefault extends boolean = boolean,
> = SchemaFieldInfo & {
	types: Field[];
	isOptional: IsOptional;
	isNullable: IsNullable;
	hasDefault: HasDefault;
};

export type SchemaType = {
	[key in string]: SchemaField;
};

export type Nullable<T, IsNullable extends boolean> = IsNullable extends true ? T | null : T;

export type KeyOfSchema<Schema extends SchemaType> = keyof Schema & string;
export type SchemaStaticValue<Schema extends SchemaType, K extends keyof Schema> =
	Schema[K] extends SchemaField<infer F, boolean, infer IsNullable>
		? F extends FieldType<string, infer T>
			? Nullable<T, IsNullable>
			: never
		: never;

type GetRequiredKey<
	Schema extends SchemaType,
	K extends keyof Schema,
> = Schema[K]["isOptional"] extends true ? never : K;
type GetOptionalKey<
	Schema extends SchemaType,
	K extends keyof Schema,
> = Schema[K]["isOptional"] extends true ? K : never;
export type SchemaStatic<Schema extends SchemaType> = {
	[K in keyof Schema as GetRequiredKey<Schema, K>]-?: SchemaStaticValue<Schema, K>;
} & {
	[K in keyof Schema as GetOptionalKey<Schema, K>]?: SchemaStaticValue<Schema, K>;
};
type SchemaKeysWithDefault<Schema extends SchemaType> = {
	[K in KeyOfSchema<Schema>]: Schema[K]["hasDefault"] extends true ? K : never;
}[KeyOfSchema<Schema>];
export type SchemaCreate<Schema extends SchemaType> = PartialBy<
	SchemaStatic<Schema>,
	SchemaKeysWithDefault<Schema>
>;

export type RecordType = {
	field: SchemaField;
};
export type RecordStatic<Record extends RecordType> = {
	[K in string]: Record extends { field: infer S }
		? S extends SchemaField<infer F, boolean, infer IsNullable>
			? F extends FieldType<string, infer T>
				? Nullable<T, IsNullable>
				: never
			: never
		: never;
};
