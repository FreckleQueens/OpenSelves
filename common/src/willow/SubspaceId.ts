import { ByteString } from "./ByteString.js";
import { Ed25519Pk } from "./Ed25519.js";

export class SubspaceId extends Ed25519Pk {
	public static encode(subspaceId: SubspaceId): ByteString {
		return subspaceId;
	}
	public static decode(input: ByteString): SubspaceId {
		return input;
	}
}
