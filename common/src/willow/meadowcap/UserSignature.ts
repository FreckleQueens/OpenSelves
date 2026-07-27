import { ByteString } from "../ByteString.js";
import { Ed25519Signature } from "../Ed25519.js";

export class UserSignature extends Ed25519Signature {
	public static encode(signature: UserSignature): ByteString {
		return signature;
	}

	public static decode(input: ByteString): {
		userSignature: UserSignature;
		consumedBytes: number;
	} {
		if (input.length < UserSignature.LENGTH) {
			throw new Error(
				"input needs to have a length of at least " +
					UserSignature.LENGTH +
					", got " +
					input.length,
				{ cause: input },
			);
		}

		return {
			userSignature: input.slice(0, UserSignature.LENGTH),
			consumedBytes: UserSignature.LENGTH,
		};
	}
}
