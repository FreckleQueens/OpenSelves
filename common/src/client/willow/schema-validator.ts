import type { Schema, SchemaStatic } from "./types.js";

export function isFieldValueValid<S extends Schema, K extends keyof S>(
	schema: S,
	key: K,
	value: unknown,
): value is SchemaStatic<S>[K] {
	const field = schema[key];

	if (!field) {
		throw new Error("field does not exist on schema", { cause: { key, schema } });
	}

	if (value === undefined) {
		return field.isOptional;
	}
	if (value === null) {
		return field.isNullable;
	}

	if (["string", "boolean", "number"].includes(field.baseTypeName)) {
		return typeof value === field.baseTypeName;
	} else {
		return !!(
			value &&
			typeof value === "object" &&
			value.constructor.name === field.baseTypeName
		);
	}
}
