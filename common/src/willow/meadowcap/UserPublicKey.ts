import { ByteString } from "../ByteString.js";
import { SubspaceId } from "../SubspaceId.js";

export class UserPublicKey extends SubspaceId {
	public static decode(input: ByteString): {
		userPublicKey: UserPublicKey;
		subspaceId: SubspaceId;
		consumedBytes: number;
	} {
		const result = super.decode(input);
		return { ...result, userPublicKey: result.subspaceId };
	}
}
