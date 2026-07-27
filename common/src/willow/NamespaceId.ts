import { ByteString } from "./ByteString.js";
import { Ed25519, type Ed25519KeyPair, Ed25519Pk } from "./Ed25519.js";

export class NamespaceId extends Ed25519Pk {
	public static isCommunal(namespaceId: NamespaceId) {
		return (namespaceId[NamespaceId.LENGTH - 1] & 0b0000_0001) === 0;
	}

	public static async generateRandomCommunalNamespaceKeys() {
		let keys: Ed25519KeyPair;
		do {
			keys = await Ed25519.generateKey();
		} while (!NamespaceId.isCommunal(keys.publicKey));
		return keys;
	}

	public static encode(namespaceId: NamespaceId): ByteString {
		return namespaceId;
	}

	public static decode(input: ByteString): {
		namespaceId: NamespaceId;
		consumedBytes: number;
	} {
		if (input.length < NamespaceId.LENGTH) {
			throw new Error(
				"input is too short, needs " + NamespaceId.LENGTH + " bytes, got " + input.length,
				{
					cause: input,
				},
			);
		}

		return {
			namespaceId: input.slice(0, NamespaceId.LENGTH),
			consumedBytes: NamespaceId.LENGTH,
		};
	}
}
