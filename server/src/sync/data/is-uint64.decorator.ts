import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { registerDecorator } from "class-validator";
import { MAX_UINT64 } from "openselves-common/willow";

export function IsUint64() {
	const validationDecorator: PropertyDecorator = (
		object: object,
		propertyName: string | symbol,
	) => {
		registerDecorator({
			name: "isUint64",
			target: object.constructor,
			propertyName: propertyName.toString(),
			constraints: [],
			options: {
				message: "$property is not a valid UInt64",
			},
			validator: {
				validate(value: unknown) {
					return typeof value === "bigint" && value >= 0n && value <= MAX_UINT64;
				},
			},
		});
	};
	return applyDecorators(
		Transform(({ value }) => {
			return typeof value === "string" ? BigInt(value) : (value as unknown);
		}),
		validationDecorator,
	);
}
