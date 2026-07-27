import { ByteString } from "./ByteString.js";
import { Ed25519Pk } from "./Ed25519.js";

export class SubspaceId extends Ed25519Pk {
	public static encode(subspaceId: SubspaceId): ByteString {
		return subspaceId;
	}

	public static decode(input: ByteString): {
		subspaceId: SubspaceId;
		consumedBytes: number;
	} {
		if (input.length < SubspaceId.LENGTH) {
			throw new Error(
				"input is too short, needs " + SubspaceId.LENGTH + " bytes, got " + input.length,
				{
					cause: input,
				},
			);
		}
		return {
			subspaceId: input.slice(0, SubspaceId.LENGTH),
			consumedBytes: SubspaceId.LENGTH,
		};
	}
}
