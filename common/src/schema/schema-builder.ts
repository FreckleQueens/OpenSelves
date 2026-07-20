import {
	type AnyFieldTypesValue,
	type BooleanFieldType,
	type DateFieldType,
	type FieldType,
	type FieldTypeValue,
	type FieldTypes,
	type NumberFieldType,
	RecordFieldType,
	type SchemaField,
	SchemaFieldType,
	type SchemaType,
	type StringFieldType,
} from "./types.js";

export class SchemaBuilder<
	Field extends FieldType,
	IsOptional extends boolean = true,
	IsNullable extends boolean = false,
	HasDefault extends boolean = false,
> implements SchemaField<Field, IsOptional, IsNullable, HasDefault> {
	public static string() {
		return new SchemaBuilder<StringFieldType>(
			[
				{
					name: "string",
				},
			],
			true,
			false,
			false,
		);
	}
	public static boolean() {
		return new SchemaBuilder<BooleanFieldType>(
			[
				{
					name: "boolean",
				},
			],
			true,
			false,
			false,
		);
	}
	public static number() {
		return new SchemaBuilder<NumberFieldType>(
			[
				{
					name: "number",
				},
			],
			true,
			false,
			false,
		);
	}
	public static date() {
		return new SchemaBuilder<DateFieldType>(
			[
				{
					name: "Date",
				},
			],
			true,
			false,
			false,
		);
	}

	public static record<ValueField extends SchemaField>(valueField: ValueField) {
		return new SchemaBuilder<RecordFieldType<{ field: ValueField }>>(
			[new RecordFieldType<{ field: ValueField }>({ field: valueField })],
			true,
			false,
			false,
		);
	}

	public static schema<Schema extends SchemaType>(schema: Schema) {
		return new SchemaBuilder<SchemaFieldType<Schema>>(
			[new SchemaFieldType(schema)],
			true,
			false,
			false,
		);
	}

	private readonly defaultValue:
		| (() => AnyFieldTypesValue | undefined)
		| AnyFieldTypesValue
		| undefined;

	protected constructor(
		public readonly types: Field[],
		public readonly isOptional: IsOptional,
		public readonly isNullable: IsNullable,
		public readonly hasDefault: HasDefault,
		defaultValue?: (() => AnyFieldTypesValue | undefined) | AnyFieldTypesValue,
		public readonly isReadonly: boolean = false,
	) {
		if (this.isOptional && this.isNullable) {
			throw new Error("A field cannot be both optional and nullable");
		}
		this.defaultValue = defaultValue;
	}

	public or<NewField extends FieldTypes>(field: NewField) {
		if (this.defaultValue) {
			throw new Error("Must define or() before default value");
		}

		return new SchemaBuilder<Field | NewField, IsOptional, IsNullable, HasDefault>(
			[...this.types, field],
			this.isOptional,
			this.isNullable,
			this.hasDefault,
			this.defaultValue,
			this.isReadonly,
		);
	}

	public required() {
		if (this.defaultValue) {
			throw new Error("Must define required() before default value");
		}

		return new SchemaBuilder(
			this.types,
			false,
			this.isNullable,
			this.hasDefault,
			this.defaultValue,
			this.isReadonly,
		);
	}

	public nullable() {
		return new SchemaBuilder(
			this.types,
			this.isOptional,
			true,
			this.hasDefault,
			this.defaultValue,
			this.isReadonly,
		);
	}

	public default(
		defaultValue: (() => FieldTypeValue<Field, IsNullable>) | FieldTypeValue<Field, IsNullable>,
	) {
		return new SchemaBuilder(
			this.types,
			this.isOptional,
			this.isNullable,
			true,
			defaultValue,
			this.isReadonly,
		);
	}

	public readonly() {
		return new SchemaBuilder(
			this.types,
			this.isOptional,
			this.isNullable,
			this.hasDefault,
			this.defaultValue,
			true,
		);
	}

	public get isDefaultGenerated(): boolean {
		return this.hasDefault && typeof this.defaultValue === "function";
	}

	public getDefault() {
		return typeof this.defaultValue === "function" ? this.defaultValue() : this.defaultValue;
	}
}
