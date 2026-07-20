import { ByteString } from "./ByteString.js";

export type Ed25519KeyPair = {
	publicKey: Ed25519Pk;
	secretKey: Ed25519Sk;
};

export class Ed25519 {
	public static async generateKey(): Promise<Ed25519KeyPair> {
		const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
		const privateKeyPkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
		return {
			publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)),
			secretKey: new Uint8Array(privateKeyPkcs8.slice(16)),
		};
	}

	public static async sign(secretKey: Ed25519Sk, payload: ByteString): Promise<Ed25519Signature> {
		const key = await crypto.subtle.importKey("raw", secretKey, "Ed25519", false, ["sign"]);
		return new Uint8Array(await crypto.subtle.sign("Ed25519", key, payload));
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

export class Ed25519Pk extends ByteString {
	public static readonly LENGTH = 32;
}

export class Ed25519Sk extends ByteString {
	public static readonly LENGTH = 32;
}

export class Ed25519Signature extends ByteString {
	public static readonly LENGTH = 64;
}
