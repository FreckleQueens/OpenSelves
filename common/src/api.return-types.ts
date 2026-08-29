import { SchemaBuilder, type SchemaStatic, type SchemaType } from "./schema/index.js";

export const GetStatusSchema = Object.freeze({
	ready: SchemaBuilder.boolean().required(),
	version: SchemaBuilder.string().required(),
	maxUploadSize: SchemaBuilder.number().required(),
	areRegistrationsOpen: SchemaBuilder.boolean().required(),
	unverifiedAccountCullingDelay: SchemaBuilder.number().required(),
}) satisfies SchemaType;
export type GetStatus = SchemaStatic<typeof GetStatusSchema>;
