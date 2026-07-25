import {
	BooleanFieldType,
	NumberFieldType,
	SchemaBuilder,
	type SchemaType,
} from "openselves-common/schema";

export const challengeCodeChallengeSchema = Object.freeze({
	image: SchemaBuilder.string().required(),
	audio: SchemaBuilder.string(),
	length: SchemaBuilder.number(),
}) satisfies SchemaType;

export const challengeParametersSchema = Object.freeze({
	algorithm: SchemaBuilder.string().required(),
	nonce: SchemaBuilder.string().required(),
	salt: SchemaBuilder.string().required(),
	cost: SchemaBuilder.number().required(),
	keyLength: SchemaBuilder.number().required(),
	keyPrefix: SchemaBuilder.string().required(),
	keySignature: SchemaBuilder.string(),
	memoryCost: SchemaBuilder.number(),
	parallelism: SchemaBuilder.number(),
	expiresAt: SchemaBuilder.number(),
	data: SchemaBuilder.record(
		SchemaBuilder.string().or(NumberFieldType).or(BooleanFieldType).required().nullable(),
	),
}) satisfies SchemaType;

export const challengeSchema = Object.freeze({
	codeChallenge: SchemaBuilder.schema(challengeCodeChallengeSchema),
	parameters: SchemaBuilder.schema(challengeParametersSchema).required(),
	signature: SchemaBuilder.string(),
}) satisfies SchemaType;

export const solutionSchema = Object.freeze({
	counter: SchemaBuilder.number().required(),
	derivedKey: SchemaBuilder.string().required(),
	time: SchemaBuilder.number(),
}) satisfies SchemaType;

export const captchaSchema = Object.freeze({
	challenge: SchemaBuilder.schema(challengeSchema).required(),
	solution: SchemaBuilder.schema(solutionSchema).required(),
	test: SchemaBuilder.string(),
}) satisfies SchemaType;
