import { isFieldValueValid } from "./schema-validator.js";
import type { Schema, SchemaStatic } from "./types.js";

export function serializeValueToPayload<Model extends Schema>(
	schema: Model,
	key: keyof Model & string,
	value: unknown,
): string {
	if (!isFieldValueValid(schema, key, value)) {
		throw new Error("Invalid value for key " + key, {
			cause: {
				value,
				schema,
			},
		});
	}

	switch (typeof value) {
		case "undefined":
			return "undefined";
		case "string":
		case "boolean":
		case "number":
			return `${typeof value};${value.toString()}`;
		case "object":
			if (value === null) {
				return "null";
			}
			if (value instanceof Date) {
				return `${value.constructor.name};${value.getTime().toString()}`;
			}
			break;
	}
	throw new Error(`Unsupported type ${typeof value}`, { cause: schema });
}

export function deserializeValueFromPayload<Model extends Schema, K extends keyof Model & string>(
	schema: Model,
	key: K,
	payload: string,
): SchemaStatic<Model>[K] {
	if (payload === "") {
		throw new Error("empty string payloads are unsupported");
	}

	const [type, value] = payload.split(";");

	let output: unknown;

	switch (type) {
		case "undefined":
			output = undefined;
			break;
		case "null":
			output = null;
			break;
		case "string":
			output = value;
			break;
		case "boolean":
			output = Boolean(value);
			break;
		case "number":
			output = Number(value);
			break;
		case "Date":
			output = new Date(Number(value));
			break;
		default:
			throw new Error(`Unsupported type ${type} for key ${key}`, { cause: schema });
	}

	if (!isFieldValueValid(schema, key, output)) {
		throw new Error("Got invalid output for key " + key, {
			cause: {
				output,
				type,
				value,
				schema,
			},
		});
	}

	return output;
}
