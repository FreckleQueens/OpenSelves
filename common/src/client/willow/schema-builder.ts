import type { ConstructSchemaFieldType, SchemaField, SupportedFieldTypeNames } from "./types.js";

export class SchemaBuilder<
	BaseTypeName extends SupportedFieldTypeNames,
	Optional extends boolean = false,
	Nullable extends boolean = false,
	HasDefault extends boolean = false,
> implements SchemaField<BaseTypeName, Optional, Nullable, HasDefault> {
	public static string() {
		return new SchemaBuilder("string", false, false, false);
	}
	public static boolean() {
		return new SchemaBuilder("boolean", false, false, false);
	}
	public static number() {
		return new SchemaBuilder("number", false, false, false);
	}
	public static date() {
		return new SchemaBuilder("Date", false, false, false);
	}

	constructor(
		public readonly baseTypeName: BaseTypeName,
		public readonly isOptional: Optional,
		public readonly isNullable: Nullable,
		public readonly hasDefault: HasDefault,
		private readonly defaultValue?:
			| ConstructSchemaFieldType<BaseTypeName, Optional, Nullable>
			| (() => ConstructSchemaFieldType<BaseTypeName, Optional, Nullable>),
	) {}

	public optional() {
		return new SchemaBuilder(
			this.baseTypeName,
			true,
			this.isNullable,
			this.hasDefault,
			this.defaultValue,
		);
	}

	public nullable() {
		return new SchemaBuilder(
			this.baseTypeName,
			this.isOptional,
			true,
			this.hasDefault,
			this.defaultValue,
		);
	}

	public default(
		defaultValue:
			| ConstructSchemaFieldType<BaseTypeName, Optional, Nullable>
			| (() => ConstructSchemaFieldType<BaseTypeName, Optional, Nullable>),
	) {
		return new SchemaBuilder(
			this.baseTypeName,
			this.isOptional,
			this.isNullable,
			true,
			defaultValue,
		);
	}

	public getDefault() {
		return typeof this.defaultValue === "function" ? this.defaultValue() : this.defaultValue;
	}
}
