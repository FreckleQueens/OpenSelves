import type {
	KeyOfSchema,
	RecordFieldType,
	SchemaField,
	SchemaFieldType,
	SchemaStatic,
	SchemaStaticValue,
	SchemaType,
} from "./types.js";

export type ValidationResult = { [key: string]: string | ValidationResult };

export function validateSchemaField<Field extends SchemaField>(
	field: Field,
	value: unknown,
):
	| {
			isValid: true;
	  }
	| {
			isValid: false;
			reason: string | ValidationResult;
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

	const failures: ValidationResult = {};

	for (const type of field.types) {
		if (["string", "boolean", "number"].includes(type.name)) {
			if (typeof value === type.name) {
				return { isValid: true };
			} else {
				failures[type.name] = `Field must be of type ${type.name}. Found ${typeof value}`;
				continue;
			}
		}

		if (isSchemaFieldType(type) && type.typeData) {
			const schemaValidation = validateSchemaStatic(type.typeData, value);
			if (Object.keys(schemaValidation).length === 0) {
				return { isValid: true };
			} else {
				failures[type.name] = schemaValidation;
				continue;
			}
		}

		if (isRecordFieldType(type) && type.typeData) {
			if (typeof value !== "object") {
				failures[type.name] = `Value must be an object. Found ${typeof value}`;
				continue;
			}

			const recordValidation: Record<string, string | ValidationResult> = {};

			for (const [key, val] of Object.entries(value)) {
				const result = validateSchemaField(type.typeData.field, val);
				if (!result.isValid) {
					recordValidation[key] = result.reason;
				}
			}

			if (Object.keys(recordValidation).length === 0) {
				return { isValid: true };
			} else {
				failures[type.name] = recordValidation;
				continue;
			}
		}

		if (value && typeof value === "object" && value.constructor.name === type.name) {
			return { isValid: true };
		} else {
			failures[type.name] =
				`Field must be of type ${type.name}. Found ${typeof value?.constructor.name}`;
		}
	}
	return {
		isValid: false,
		reason: failures,
	};
}

export function isSchemaFieldType(value: unknown): value is SchemaFieldType {
	return !!(value && typeof value === "object" && value["name"] === "schema");
}

export function isRecordFieldType(value: unknown): value is RecordFieldType {
	return !!(
		value &&
		typeof value === "object" &&
		value["name"] === "record" &&
		"typeData" in value &&
		value.typeData &&
		typeof value.typeData === "object" &&
		"field" in value.typeData &&
		value.typeData.field &&
		Array.isArray(value.typeData.field["types"])
	);
}

export function validateSchemaStatic<Schema extends SchemaType>(
	schema: Schema,
	data: unknown,
): ValidationResult {
	if (!data || typeof data !== "object") {
		return { _globalError: "data is not an object" };
	}
	const validationErrors: ValidationResult = {};

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
): value is SchemaStaticValue<Schema, Key> {
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
