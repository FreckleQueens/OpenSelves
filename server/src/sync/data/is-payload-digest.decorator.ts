import { registerDecorator } from "class-validator";
import type { ValidationOptions } from "class-validator";
import { verifyPayload } from "openselves-common/willow";

export function IsPayloadDigest(options: ValidationOptions = {}) {
	return (object: object, propertyName: string | symbol) => {
		registerDecorator({
			name: "isPayloadDigest",
			target: object.constructor,
			propertyName: propertyName.toString(),
			constraints: [],
			options: {
				message: "$property is not a valid digest for the payload",
				...options,
			},
			validator: {
				validate: async (value: unknown, args) => {
					return !!(
						args &&
						args.object &&
						"payload" in args.object &&
						typeof args.object.payload === "string" &&
						typeof value === "string" &&
						(
							await verifyPayload(
								args.object.payload,
								BigInt(args.object.payload.length),
								value,
							)
						).isSuccess
					);
				},
			},
		});
	};
}
