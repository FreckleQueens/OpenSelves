import { type SchemaStaticValue, isValidSchemaFieldValue } from "../../schema/index.js";
import type { SchemaType } from "../../schema/types.js";
import { ByteString } from "../../willow/index.js";

export function serializeValueToPayload<Model extends SchemaType>(
	schema: Model,
	key: keyof Model & string,
	value: unknown,
): ByteString {
	if (!isValidSchemaFieldValue(schema, key, value)) {
		throw new Error("Invalid value for key " + key, {
			cause: {
				value,
				schema,
			},
		});
	}

	return serializeValueToPayloadUnsafe(value);
}

export function serializeValueToPayloadUnsafe(value: unknown): ByteString {
	if (value === undefined || value === null || value === "") {
		return new Uint8Array(0);
	}

	let stringValue: string | undefined;

	switch (typeof value) {
		case "string":
		case "boolean":
		case "number":
			stringValue = value.toString();
			break;
		case "object":
			if (value instanceof Date) {
				stringValue = value.getTime().toString();
			}
			break;
	}

	if (stringValue !== undefined) {
		return ByteString.fromUtf8(stringValue);
	}

	throw new Error(`Unsupported type ${typeof value}`, { cause: value });
}

export function deserializeValueFromPayload<
	Model extends SchemaType,
	K extends keyof Model & string,
>(schema: Model, key: K, payload: ByteString): SchemaStaticValue<Model, K> {
	const field = schema[key];

	let output: unknown;

	if (payload.length === 0) {
		if (field.types.some((type) => type.name === "string")) {
			output = "";
		} else if (field.isOptional) {
			output = undefined;
		} else if (field.isNullable) {
			output = null;
		}
	}

	const stringValue = ByteString.toUtf8(payload);

	outer: for (const type of field.types) {
		switch (type.name) {
			case "string":
				output = stringValue;
				break outer;
			case "boolean":
				output = stringValue === "true";
				break outer;
			case "number":
				output = Number(stringValue);
				break outer;
			case "Date":
				output = new Date(Number(stringValue));
				break outer;
		}
	}

	if (!isValidSchemaFieldValue(schema, key, output)) {
		throw new Error("Got invalid output for key " + key, {
			cause: {
				output,
				stringValue,
				schema,
			},
		});
	}

	return output;
}
