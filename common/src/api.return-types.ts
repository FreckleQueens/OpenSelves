export type ApiResultValue = string | boolean | number | Date;
export type ApiResultValuePrimitiveType =
	| StringConstructor
	| BooleanConstructor
	| NumberConstructor;
export type ApiResultValueType = ApiResultValuePrimitiveType | DateConstructor;
export type ApiResultFields = Record<string, ApiResultValueType>;
export type ApiResult<Fields extends ApiResultFields> = {
	[p in keyof Fields]: Fields[p] extends ApiResultValuePrimitiveType
		? ReturnType<Fields[p]>
		: InstanceType<Fields[p]>;
};

export const GetStatus = {
	ready: Boolean,
	version: String,
	maxUploadSize: Number,
	areRegistrationsOpen: Boolean,
	unverifiedAccountCullingDelay: Number,
};
export type GetStatusResult = ApiResult<typeof GetStatus>;

export const GetUser = {
	id: String,
	email: String,
	createdAt: Date,
	isEmailVerified: Boolean,
} satisfies ApiResultFields;
export type GetUserResult = ApiResult<typeof GetUser>;

export function parseApiResult<Fields extends ApiResultFields>(
	fields: Fields,
	value: unknown,
): ApiResult<Fields> {
	if (!value) {
		throw new Error("Missing value", { cause: value });
	}
	if (typeof value !== "object") {
		throw new Error("value is not an object", { cause: value });
	}

	const output: Record<string, ApiResultValue> = {};
	for (const [key, type] of Object.entries(fields)) {
		if (!(key in value)) {
			throw new Error("Missing field " + key, { cause: value });
		}

		if (type === String || type === Boolean || type === Number) {
			if (typeof value[key] !== type.name.toLowerCase()) {
				throw new Error("Field " + key + " is not of type " + type.name, { cause: value });
			}
			output[key] = value[key] as ApiResultValue;
		} else if (type === Date) {
			if (typeof value[key] !== "string") {
				throw new Error("Date field " + key + " is not of type string", { cause: value });
			}
			output[key] = new Date(value[key]);
		} else {
			throw new Error(`Unsupported type ${type?.toString()}`, { cause: fields });
		}
	}

	return output as ApiResult<Fields>;
}
