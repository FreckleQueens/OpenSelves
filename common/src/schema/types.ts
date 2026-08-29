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
export const UndefinedFieldType: UndefinedFieldType = Object.freeze({
	name: "undefined",
});

export type NullFieldType = FieldType<"null", null>;
export const NullFieldType: NullFieldType = Object.freeze({
	name: "null",
});

export type StringFieldType = FieldType<"string", string>;
export const StringFieldType: StringFieldType = Object.freeze({
	name: "string",
});

export type BooleanFieldType = FieldType<"boolean", boolean>;
export const BooleanFieldType: BooleanFieldType = Object.freeze({
	name: "boolean",
});

export type NumberFieldType = FieldType<"number", number>;
export const NumberFieldType: NumberFieldType = Object.freeze({
	name: "number",
});

export type DateFieldType = FieldType<"Date", Date>;
export const DateFieldType: DateFieldType = Object.freeze({
	name: "Date",
});

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
	readonly types: ReadonlyArray<FieldType>;
	readonly isOptional: boolean;
	readonly isNullable: boolean;
	readonly hasDefault: boolean;
	readonly isDefaultGenerated: boolean;
	readonly isReadonly: boolean;
	readonly getDefault: () => AnyFieldTypesValue;
};
export type SchemaField<
	Field extends FieldType = FieldTypes,
	IsOptional extends boolean = boolean,
	IsNullable extends boolean = boolean,
	HasDefault extends boolean = boolean,
> = SchemaFieldInfo & {
	readonly types: ReadonlyArray<Field>;
	readonly isOptional: IsOptional;
	readonly isNullable: IsNullable;
	readonly hasDefault: HasDefault;
};

export type SchemaType = Readonly<{
	[key in string]: SchemaField;
}>;

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
	-readonly [K in keyof Schema as GetRequiredKey<Schema, K>]-?: SchemaStaticValue<Schema, K>;
} & {
	-readonly [K in keyof Schema as GetOptionalKey<Schema, K>]?: SchemaStaticValue<Schema, K>;
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
