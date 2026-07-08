import type {
	ConstructSchemaFieldType,
	SchemaField,
	SupportedSchemaFieldTypeNames,
} from "./types.js";

export class SchemaBuilder<
	BaseTypeName extends SupportedSchemaFieldTypeNames,
	Optional extends boolean,
	Nullable extends boolean,
	HasDefault extends boolean,
> implements SchemaField<BaseTypeName, Optional, Nullable, HasDefault> {
	public static string() {
		return new SchemaBuilder("string", true, false, false);
	}
	public static boolean() {
		return new SchemaBuilder("boolean", true, false, false);
	}
	public static number() {
		return new SchemaBuilder("number", true, false, false);
	}
	public static date() {
		return new SchemaBuilder("Date", true, false, false);
	}

	constructor(
		public readonly baseTypeName: BaseTypeName,
		public readonly isOptional: Optional,
		public readonly isNullable: Nullable,
		public readonly hasDefault: HasDefault,
		private readonly defaultValue?:
			| ConstructSchemaFieldType<BaseTypeName, Optional, Nullable>
			| (() => ConstructSchemaFieldType<BaseTypeName, Optional, Nullable>),
		public readonly isReadonly: boolean = false,
	) {}

	public required() {
		if (this.defaultValue) {
			throw new Error("Must define required() before default value");
		}

		return new SchemaBuilder(
			this.baseTypeName,
			false,
			this.isNullable,
			this.hasDefault,
			this.defaultValue,
			this.isReadonly,
		);
	}

	public nullable() {
		return new SchemaBuilder(
			this.baseTypeName,
			this.isOptional,
			true,
			this.hasDefault,
			this.defaultValue,
			this.isReadonly,
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
			this.isReadonly,
		);
	}

	public readonly() {
		return new SchemaBuilder(
			this.baseTypeName,
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
