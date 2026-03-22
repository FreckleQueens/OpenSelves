import Joi, { ArraySchema, ObjectSchema } from "joi";

export interface ConfigData {
	LISTEN_PORT: number;
	DATABASE_URL: string;
	SHADOW_DATABASE_URL: string;
	TEST_DB_URL: string;

	ALLOWED_ORIGINS: string[];

	JWT_SECRET: string;

	ACCESS_TOKEN_DURATION: number;

	REFRESH_TOKEN_DURATION: number;

	REFRESH_TOKEN_SIZE: number;
}

interface ExtendedJoi extends Joi.Root {
	strCommaList(): ArraySchema;
}

const extendedJoi = Joi.extend((joi) => ({
	type: "strCommaList",
	base: joi.array(),
	coerce: (value) => ({
		value: (typeof value === "string" ? value.split(",") : value) as unknown,
	}),
})) as ExtendedJoi;

export const validationSchema: ObjectSchema<ConfigData> = Joi.object({
	LISTEN_PORT: Joi.number(),
	DATABASE_URL: Joi.string().uri().required(),
	SHADOW_DATABASE_URL: Joi.string().uri().required(),
	TEST_DB_URL: Joi.string().uri().not(Joi.ref("DATABASE_URL")).messages({
		"any.invalid": "TEST_DB_URL cannot be the same as DATABASE_URL",
	}),

	ALLOWED_ORIGINS: extendedJoi
		.strCommaList()
		.items(
			Joi.string().uri({
				allowRelative: false,
			}),
		)
		.required(),

	JWT_SECRET: Joi.string().min(32).alphanum().required(),

	ACCESS_TOKEN_DURATION: Joi.number()
		.positive()
		.less(Joi.ref("REFRESH_TOKEN_DURATION"))
		.required(),

	REFRESH_TOKEN_DURATION: Joi.number().positive().required(),

	REFRESH_TOKEN_SIZE: Joi.number().min(16).required(),
});
