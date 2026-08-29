import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { ValidateBy, buildMessage } from "class-validator";
import type { ValidationOptions } from "class-validator";
import { ByteString } from "openselves-common/willow";

export function IsByteString(length?: number, validationOptions: ValidationOptions = {}) {
	return applyDecorators(
		Transform(({ value }) => {
			if (validationOptions.each) {
				return Array.isArray(value)
					? value.map((val) =>
							typeof val === "string" ? Uint8Array.fromBase64(val) : (val as unknown),
						)
					: (value as unknown);
			}
			return typeof value === "string" ? Uint8Array.fromBase64(value) : (value as unknown);
		}),
		ValidateBy(
			{
				name: "isByteString",
				constraints: [],
				validator: {
					validate(value: unknown) {
						return (
							ByteString.is(value) &&
							(typeof length !== "number" || value.length === length)
						);
					},
					defaultMessage: buildMessage(function (eachPrefix) {
						return (
							eachPrefix +
							"$property must be a valid base64 encoded ByteString" +
							(typeof length === "number" ? " of length " + length : "")
						);
					}, validationOptions),
				},
			},
			validationOptions,
		),
	);
}
