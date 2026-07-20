import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { registerDecorator } from "class-validator";
import type { ValidationOptions } from "class-validator";
import { ByteString } from "openselves-common/willow";

export function IsByteString(length?: number, options: ValidationOptions = {}) {
	const validationDecorator: PropertyDecorator = (
		object: object,
		propertyName: string | symbol,
	) => {
		registerDecorator({
			name: "isByteString",
			target: object.constructor,
			propertyName: propertyName.toString(),
			constraints: [],
			options: {
				message:
					"$property is not a valid ByteString" + typeof length === "number"
						? " of length " + length
						: "",
				...options,
			},
			validator: {
				validate(value: unknown) {
					return (
						ByteString.is(value) &&
						(typeof length !== "number" || value.length === length)
					);
				},
			},
		});
	};
	return applyDecorators(
		Transform(({ value }) => {
			return typeof value === "string" ? Uint8Array.fromBase64(value) : (value as unknown);
		}),
		validationDecorator,
	);
}
