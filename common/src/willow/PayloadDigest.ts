import { ByteString } from "./ByteString.js";

export class PayloadDigest extends ByteString {
	public static readonly LENGTH = 32;

	public static isValid(payloadDigest: PayloadDigest): boolean {
		return payloadDigest.length === 32; // 32 bytes, aka 256 bits
	}

	/**
	 * Uses sha256
	 * TODO: switch to william3
	 */
	public static async hash(this: void, payload: ByteString): Promise<PayloadDigest> {
		return new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
	}

	public static async verify(payloadDigest: ByteString, payload: ByteString): Promise<boolean> {
		const expectedHash = await PayloadDigest.hash(payload);
		return PayloadDigest.equals(payloadDigest, expectedHash);
	}

	public static encode(payloadDigest: PayloadDigest): ByteString {
		return payloadDigest;
	}
	public static decode(input: ByteString): PayloadDigest {
		return input;
	}
}
