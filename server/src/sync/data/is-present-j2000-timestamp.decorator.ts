import { registerDecorator } from "class-validator";
import type { ValidationOptions } from "class-validator";
import { j2000Now } from "openselves-common/willow";

export function IsPresentJ2000Timestamp(options: ValidationOptions = {}) {
	return (object: object, propertyName: string | symbol) => {
		registerDecorator({
			name: "isPresentJ2000Timestamp",
			target: object.constructor,
			propertyName: propertyName.toString(),
			constraints: [],
			options: {
				message: "$property is too far in the future",
				...options,
			},
			validator: {
				validate(value: unknown) {
					return (
						(typeof value === "bigint" || typeof value === "number") &&
						value < j2000Now() + 10n * 60n * 1000_000n
					);
				},
			},
		});
	};
}
