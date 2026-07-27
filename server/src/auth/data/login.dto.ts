import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";
import { type ByteString, Ed25519Signature } from "openselves-common/willow";

import { IsByteString } from "../../sync/data/is-byte-string.decorator.js";

export class LoginDto {
	@IsString()
	@MinLength(1)
	public readonly challenge!: string;

	@IsByteString(Ed25519Signature.LENGTH)
	public readonly signature!: ByteString;

	@IsBoolean()
	@IsOptional()
	public readonly persistSession?: boolean;
}
