import { ArrayMinSize, IsArray, IsBoolean, IsOptional } from "class-validator";
import { SubspaceId } from "openselves-common/willow";

import { IsByteString } from "../../sync/data/is-byte-string.decorator.js";

export class LoginDto {
	@IsArray()
	@ArrayMinSize(1)
	@IsByteString(SubspaceId.LENGTH, { each: true })
	public readonly subspaceIds!: SubspaceId[];

	@IsBoolean()
	@IsOptional()
	public readonly persistSession?: boolean;
}
