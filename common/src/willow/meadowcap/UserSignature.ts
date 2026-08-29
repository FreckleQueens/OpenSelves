import type { ByteProvider } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
import { Ed25519Signature } from "../Ed25519.js";

export class UserSignature extends Ed25519Signature {
	public static encode(signature: UserSignature): ByteString {
		return signature;
	}

	public static async decode(provider: ByteProvider): Promise<UserSignature> {
		return provider.read(UserSignature.LENGTH);
	}
}
