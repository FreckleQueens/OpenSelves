import { isCuid } from "@paralleldrive/cuid2";
import { registerDecorator } from "class-validator";

export function IsCuid2() {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: "isCuid2",
			target: object.constructor,
			propertyName: propertyName,
			constraints: [],
			options: {
				message: "$property is not a valid cuid2",
			},
			validator: {
				validate(value: unknown) {
					return typeof value === "string" && isCuid(value);
				},
			},
		});
	};
}
