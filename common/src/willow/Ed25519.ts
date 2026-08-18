import { ByteString, type ByteStringOfLength } from "./ByteString.js";

export type Ed25519KeyPair = {
	publicKey: Ed25519Pk;
	secretKey: Ed25519Sk;
};

export class Ed25519 {
	public static async generateKey(): Promise<Ed25519KeyPair> {
		const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
		const privateKeyPkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
		return {
			publicKey: Ed25519Pk.fromBuffer(
				await crypto.subtle.exportKey("raw", keyPair.publicKey),
			),
			secretKey: Ed25519Sk.fromBuffer(privateKeyPkcs8.slice(16)),
		};
	}

	public static async sign(secretKey: Ed25519Sk, payload: ByteString): Promise<Ed25519Signature> {
		const key = await crypto.subtle.importKey(
			"pkcs8",
			ByteString.of(
				// This is a pkcs8 header containing the "sign" usage
				...[48, 46, 2, 1, 0, 48, 5, 6, 3, 43, 101, 112, 4, 34, 4, 32],
				...secretKey,
			),
			"Ed25519",
			false,
			["sign"],
		);
		return Ed25519Signature.fromBuffer(await crypto.subtle.sign("Ed25519", key, payload));
	}

	public static async verify(
		publicKey: Ed25519Pk,
		signature: Ed25519Signature,
		data: ByteString,
	): Promise<boolean> {
		const key = await crypto.subtle.importKey("raw", publicKey, "Ed25519", true, ["verify"]);
		return await crypto.subtle.verify("Ed25519", key, signature, data);
	}
}

export class Ed25519Pk extends ByteString implements ByteStringOfLength<typeof Ed25519Pk.LENGTH> {
	public static readonly LENGTH = 32 as const;

	public static is(value: unknown): value is Ed25519Pk {
		return super.is(value, Ed25519Pk.LENGTH);
	}

	public static copy(val: Ed25519Pk): Ed25519Pk {
		return super.copy(val) as Ed25519Sk;
	}

	public static of(...elements: number[]): Ed25519Pk {
		return super.of(...elements) as Ed25519Pk;
	}

	public static fromHex(input: string): Ed25519Pk {
		return super.fromHex(input) as Ed25519Pk;
	}

	public static fromBase64(input: string): Ed25519Pk {
		return super.fromBase64(input) as Ed25519Pk;
	}

	public static fromBuffer(buffer: ArrayBuffer): Ed25519Pk {
		return super.fromBuffer(buffer) as Ed25519Pk;
	}

	public readonly length = Ed25519Pk.LENGTH;
	public readonly byteLength = Ed25519Pk.LENGTH;
}

export class Ed25519Sk extends ByteString implements ByteStringOfLength<typeof Ed25519Sk.LENGTH> {
	public static readonly LENGTH = 32 as const;

	public static is(value: unknown): value is Ed25519Sk {
		return super.is(value, Ed25519Sk.LENGTH);
	}

	public static copy(val: Ed25519Sk): Ed25519Sk {
		return super.copy(val) as Ed25519Pk;
	}

	public static of(...elements: number[]): Ed25519Sk {
		return super.of(...elements) as Ed25519Sk;
	}

	public static fromHex(input: string): Ed25519Sk {
		return super.fromHex(input) as Ed25519Sk;
	}

	public static fromBase64(input: string): Ed25519Sk {
		return super.fromBase64(input) as Ed25519Sk;
	}

	public static fromBuffer(buffer: ArrayBuffer): Ed25519Sk {
		return super.fromBuffer(buffer) as Ed25519Sk;
	}

	public readonly length = Ed25519Sk.LENGTH;
	public readonly byteLength = Ed25519Sk.LENGTH;
}

export class Ed25519Signature
	extends ByteString
	implements ByteStringOfLength<typeof Ed25519Signature.LENGTH>
{
	public static readonly LENGTH = 64 as const;

	public static is(value: unknown): value is Ed25519Signature {
		return super.is(value, Ed25519Signature.LENGTH);
	}

	public static copy(val: Ed25519Signature): Ed25519Signature {
		return super.copy(val) as Ed25519Signature;
	}

	public static of(...elements: number[]): Ed25519Signature {
		return super.of(...elements) as Ed25519Signature;
	}

	public static fromHex(input: string): Ed25519Signature {
		return super.fromHex(input) as Ed25519Signature;
	}

	public static fromBase64(input: string): Ed25519Signature {
		return super.fromBase64(input) as Ed25519Signature;
	}

	public static fromBuffer(buffer: ArrayBuffer): Ed25519Signature {
		return super.fromBuffer(buffer) as Ed25519Signature;
	}

	public readonly length = Ed25519Signature.LENGTH;
	public readonly byteLength = Ed25519Signature.LENGTH;
}
