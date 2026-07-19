import { IsString } from "class-validator";
import { ByteString, SubspaceId } from "openselves-common/willow";

import { IsByteString } from "./is-byte-string.decorator.js";

export class PullDto {
	@IsString()
	public readonly timestamp!: string;

	@IsByteString(SubspaceId.LENGTH)
	public readonly subspaceId!: ByteString;
}
