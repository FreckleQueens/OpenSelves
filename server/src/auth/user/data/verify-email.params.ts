import { IsAlphanumeric, IsString, Length } from "class-validator";

import { FindOneParams } from "./find-one.params.js";

export class VerifyEmailParams extends FindOneParams {
	@IsString()
	@IsAlphanumeric()
	@Length(64)
	public readonly token!: string;
}
