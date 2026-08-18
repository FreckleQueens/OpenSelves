import type { ByteProvider } from "./ByteProvider.js";
import { ByteString, type ByteStringOfLength } from "./ByteString.js";

export class PayloadDigest
	extends ByteString
	implements ByteStringOfLength<typeof PayloadDigest.LENGTH>
{
	public static readonly LENGTH = 32 as const;

	public static copy(val: PayloadDigest): PayloadDigest {
		return super.copy(val) as PayloadDigest;
	}

	public static of(...elements: number[]): PayloadDigest {
		return super.of(...elements) as PayloadDigest;
	}

	public static fromBuffer(buffer: ArrayBuffer): PayloadDigest {
		return super.fromBuffer(buffer) as PayloadDigest;
	}

	public static isValid(payloadDigest: PayloadDigest): boolean {
		return payloadDigest.length === 32; // 32 bytes, aka 256 bits
	}

	/**
	 * Uses sha256
	 * TODO: switch to william3
	 */
	public static async hash(this: void, payload: ByteString): Promise<PayloadDigest> {
		return PayloadDigest.fromBuffer(await crypto.subtle.digest("SHA-256", payload));
	}

	public static async verify(payloadDigest: ByteString, payload: ByteString): Promise<boolean> {
		const expectedHash = await PayloadDigest.hash(payload);
		return PayloadDigest.equals(payloadDigest, expectedHash);
	}

	public static encode(payloadDigest: PayloadDigest): ByteString {
		return payloadDigest;
	}
	public static async decode(provider: ByteProvider): Promise<PayloadDigest> {
		return provider.read(PayloadDigest.LENGTH);
	}

	public readonly length = PayloadDigest.LENGTH;
	public readonly byteLength = PayloadDigest.LENGTH;
}
