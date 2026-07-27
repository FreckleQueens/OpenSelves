import { ArrayMinSize, IsArray, IsString } from "class-validator";
import { ByteString } from "openselves-common/willow";

import { IsByteString } from "./is-byte-string.decorator.js";

export class PullDto {
	@IsString()
	public readonly timestamp!: string;

	@IsArray()
	@ArrayMinSize(1)
	@IsByteString(undefined, { each: true })
	public readonly capabilities!: ByteString[];
}
