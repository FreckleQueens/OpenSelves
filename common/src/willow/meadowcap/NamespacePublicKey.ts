import type { ByteString } from "../ByteString.js";
import { NamespaceId } from "../NamespaceId.js";

export class NamespacePublicKey extends NamespaceId {
	public static decode(input: ByteString): {
		namespaceId: NamespaceId;
		namespacePublicKey: NamespacePublicKey;
		consumedBytes: number;
	} {
		const result = super.decode(input);
		return {
			...result,
			namespacePublicKey: result.namespaceId,
		};
	}
}
