import type {
	KeyOfSchema,
	SchemaField,
	SchemaStatic,
	SchemaType,
	SupportedSchemaFieldTypeNames,
} from "./types.js";

export function validateSchemaField<
	Field extends SchemaField<SupportedSchemaFieldTypeNames, boolean, boolean, boolean>,
>(
	field: Field,
	value: unknown,
):
	| {
			isValid: true;
	  }
	| {
			isValid: false;
			reason: string;
	  } {
	if (value === undefined) {
		return field.isOptional
			? { isValid: true }
			: { isValid: false, reason: "Field is not optional" };
	}
	if (value === null) {
		return field.isNullable
			? { isValid: true }
			: { isValid: false, reason: "Field is not nullable" };
	}

	if (["string", "boolean", "number"].includes(field.baseTypeName)) {
		return typeof value === field.baseTypeName
			? { isValid: true }
			: {
					isValid: false,
					reason: `Field must be of type ${field.baseTypeName}. Found ${typeof value}`,
				};
	} else {
		return value && typeof value === "object" && value.constructor.name === field.baseTypeName
			? { isValid: true }
			: {
					isValid: false,
					reason: `Field must be of type ${field.baseTypeName}. Found ${typeof value?.constructor.name}`,
				};
	}
}

export function validateSchemaStatic<Schema extends SchemaType>(
	schema: Schema,
	data: unknown,
): Record<string, string> {
	if (!data || typeof data !== "object") {
		return { _globalError: "data is not an object" };
	}
	const validationErrors: Record<string, string> = {};

	for (const [key, field] of Object.entries(schema)) {
		const result = validateSchemaField(field, data[key]);
		if (!result.isValid) {
			validationErrors[key] = result.reason;
		}
	}

	return validationErrors;
}

export function isValidSchemaFieldValue<Schema extends SchemaType, Key extends KeyOfSchema<Schema>>(
	schema: Schema,
	key: Key,
	value: unknown,
): value is SchemaStatic<Schema>[Key] {
	return isValidSchemaKey(schema, key) && validateSchemaField(schema[key], value).isValid;
}

export function isValidSchemaKey<Schema extends SchemaType>(
	schema: Schema,
	key: unknown,
): key is KeyOfSchema<Schema> {
	return typeof key === "string" && Object.keys(schema).includes(key);
}

export function isValidSchemaStatic<Schema extends SchemaType>(
	schema: Schema,
	data: unknown,
): data is SchemaStatic<Schema> {
	return !!(
		data &&
		typeof data === "object" &&
		Object.keys(validateSchemaStatic(schema, data)).length === 0
	);
}
