import { registerDecorator } from "class-validator";
import type { ValidationOptions } from "class-validator";

export function IsPayloadLength(options: ValidationOptions = {}) {
	return (object: object, propertyName: string | symbol) => {
		registerDecorator({
			name: "isPayloadLength",
			target: object.constructor,
			propertyName: propertyName.toString(),
			constraints: [],
			options: {
				message: "$property is not equal to payload.length",
				...options,
			},
			validator: {
				validate(value: unknown, args) {
					return !!(
						args &&
						args.object &&
						"payload" in args.object &&
						typeof args.object.payload === "string" &&
						(typeof value === "bigint" || typeof value === "number") &&
						BigInt(value) === BigInt(args.object.payload.length)
					);
				},
			},
		});
	};
}
