import type { ByteProvider } from "../ByteProvider.js";
import type { ByteString } from "../ByteString.js";
import { Ed25519Signature } from "../Ed25519.js";

export class NamespaceSignature extends Ed25519Signature {
	public static encode(val: NamespaceSignature): ByteString {
		return val;
	}

	public static async decode(provider: ByteProvider): Promise<NamespaceSignature> {
		return provider.read(NamespaceSignature.LENGTH);
	}
}
