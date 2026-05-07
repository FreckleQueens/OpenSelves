import Joi, { type ArraySchema, type ObjectSchema } from "joi";

export interface ConfigData {
	CLI_ENV: "production" | "development";

	PUBLIC_URL: string;
	LISTEN_PORT: number;
	DATABASE_URL: string;
	TEST_DB_URL: string;

	ALLOWED_ORIGINS: string[];

	JWT_SECRET: string;

	ACCESS_TOKEN_DURATION: number;

	REFRESH_TOKEN_DURATION: number;

	REFRESH_TOKEN_SIZE: number;

	REGISTRATION_PASSWORD: string | undefined;
	CAPTCHA_SECRET: string;
	CAPTCHA_KEY_SECRET: string;

	MAX_UPLOAD_SIZE: number;
	TMP_UPLOAD_DIR?: string;
	S3_REGION?: string;
	S3_ENDPOINT?: string;
	S3_BUCKET?: string;
	S3_ACCESS_KEY?: string;
	S3_SECRET_KEY?: string;

	INSECURE_EASY_CAPTCHA_FOR_TESTS: boolean;

	_APP_VERSION: string;
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
	CLI_ENV: Joi.string().valid("production", "development").default("production"),

	PUBLIC_URL: Joi.string()
		.uri({
			allowRelative: false,
			scheme: ["http", "https"],
		})
		.required(),
	LISTEN_PORT: Joi.number(),
	DATABASE_URL: Joi.string().uri().required(),
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

	JWT_SECRET: Joi.string().min(32).alphanum().not("CHANGE_ME").required().messages({
		"any.invalid": "Please set JWT_SECRET environment variable to secure random string",
		"any.required": "Please set JWT_SECRET environment variable to secure random string",
	}),

	ACCESS_TOKEN_DURATION: Joi.number()
		.positive()
		.less(Joi.ref("REFRESH_TOKEN_DURATION"))
		.required(),

	REFRESH_TOKEN_DURATION: Joi.number().positive().required(),

	REFRESH_TOKEN_SIZE: Joi.number().min(16).required(),

	REGISTRATION_PASSWORD: Joi.string().min(8),
	CAPTCHA_SECRET: Joi.string().min(32).not("CHANGE_ME").required().messages({
		"any.invalid": "Please set CAPTCHA_SECRET environment variable to secure random string",
		"any.required": "Please set CAPTCHA_SECRET environment variable to secure random string",
	}),
	CAPTCHA_KEY_SECRET: Joi.string()
		.min(32)
		.not("CHANGE_ME")
		.not(Joi.ref("CAPTCHA_SECRET"))
		.required()
		.messages({
			"any.invalid":
				"Please set CAPTCHA_KEY_SECRET environment variable to secure random string (different than CAPTCHA_SECRET)",
			"any.required":
				"Please set CAPTCHA_KEY_SECRET environment variable to secure random string",
		}),

	MAX_UPLOAD_SIZE: Joi.number().min(0).default(0),
	TMP_UPLOAD_DIR: Joi.string(),
	S3_REGION: Joi.string(),
	S3_ENDPOINT: Joi.string().uri(),
	S3_BUCKET: Joi.string(),
	S3_ACCESS_KEY: Joi.string(),
	S3_SECRET_KEY: Joi.string(),

	INSECURE_EASY_CAPTCHA_FOR_TESTS: Joi.boolean(),
	_APP_VERSION: Joi.forbidden(),
});
