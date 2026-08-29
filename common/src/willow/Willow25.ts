import { Ed25519, Ed25519Pk, Ed25519Signature, Ed25519Sk } from "./Ed25519.js";
import { PayloadDigest } from "./PayloadDigest.js";

export class Willow25 {
	public static readonly signatureScheme = Ed25519;

	public static readonly MAX_COMPONENT_LENGTH = 4096;
	public static readonly MAX_COMPONENT_COUNT = 4096;
	public static readonly MAX_PATH_LENGTH = 4096;

	public static readonly hashPayload = PayloadDigest.hash;

	public static readonly DIGEST_LENGTH = PayloadDigest.LENGTH;

	public static readonly DEFAULT_PUBLIC_KEY: Ed25519Pk = Ed25519Pk.of(
		...[
			147, 78, 96, 33, 51, 158, 31, 1, 59, 169, 73, 0, 237, 194, 93, 141, 116, 192, 180, 229,
			115, 118, 137, 16, 174, 15, 80, 125, 140, 129, 115, 24,
		],
	);
	public static readonly DEFAULT_PRIVATE_KEY: Ed25519Sk = Ed25519Sk.of(
		...[
			94, 20, 172, 228, 210, 200, 2, 143, 200, 154, 143, 4, 118, 91, 25, 210, 205, 117, 45,
			145, 187, 55, 60, 12, 158, 212, 118, 39, 107, 92, 69, 65,
		],
	);
	public static readonly DEFAULT_NAMESPACE_ID: Ed25519Pk = Willow25.DEFAULT_PUBLIC_KEY;
	public static readonly DEFAULT_SUBSPACE_ID: Ed25519Pk = Willow25.DEFAULT_NAMESPACE_ID;
	public static readonly DEFAULT_PAYLOAD_DIGEST: PayloadDigest = PayloadDigest.of(
		...[
			150, 211, 76, 84, 120, 69, 130, 49, 227, 100, 118, 121, 82, 170, 234, 2, 163, 29, 34, 3,
			198, 111, 67, 101, 105, 46, 249, 31, 53, 16, 104, 210,
		],
	);
	public static readonly DEFAULT_AUTHORISATION_TOKEN_SIGNATURE: Ed25519Signature =
		Ed25519Signature.of(
			...[
				42, 201, 58, 210, 193, 63, 237, 182, 150, 52, 93, 186, 198, 231, 18, 84, 233, 156,
				180, 68, 229, 232, 27, 145, 111, 202, 8, 120, 240, 168, 169, 147, 43, 209, 164, 232,
				70, 225, 202, 131, 55, 123, 116, 10, 41, 184, 87, 10, 133, 3, 141, 80, 102, 43, 168,
				175, 102, 229, 104, 60, 147, 82, 20, 1,
			],
		);
}
