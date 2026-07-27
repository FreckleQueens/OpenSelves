import { type ByteString, UserPublicKey } from "openselves-common/willow";

import { IsByteString } from "../../sync/data/is-byte-string.decorator.js";

export class GetChallengeDto {
	@IsByteString(UserPublicKey.LENGTH)
	public readonly userKey!: ByteString;
}
