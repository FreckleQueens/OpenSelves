import { ArrayMinSize, IsArray, IsString } from "class-validator";
import { SubspaceId } from "openselves-common/willow";

import { IsByteString } from "./is-byte-string.decorator.js";

export class PullDto {
	@IsString()
	public readonly timestamp!: string;

	@IsArray()
	@ArrayMinSize(1)
	@IsByteString(SubspaceId.LENGTH, { each: true })
	public readonly subspaceIds!: SubspaceId[];
}
