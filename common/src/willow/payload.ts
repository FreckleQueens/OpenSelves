import { Buffer } from "buffer";

export const PAYLOAD_DIGEST_FIELDS_DELIMITER = ";";
export const PAYLOAD_DIGEST_ALGORITHM = "sha256";
export const PAYLOAD_DIGEST_ENCODING = "hex";

/**
 * Uses sha256
 * TODO: switch to william3
 */
export async function hashPayload(payload: string): Promise<string> {
	return hashPayloadWith(payload, PAYLOAD_DIGEST_ALGORITHM, PAYLOAD_DIGEST_ENCODING);
}

export enum VerifyPayloadStatus {
	SUCCESS,

	INVALID_PAYLOAD_LENGTH,
	UNSUPPORTED_HASH_ALGORITHM,
	UNSUPPORTED_HASH_ENCODING,
	INVALID_HASH,
}

type VerifyPayloadResult = {
	isSuccess: boolean;
	status: VerifyPayloadStatus;
	statusName: string;
	cause?: { toString(): string };
};

function makeVerifyPayloadResult(
	status: VerifyPayloadStatus,
	cause?: { toString(): string },
): VerifyPayloadResult {
	const result: VerifyPayloadResult = {
		isSuccess: status === VerifyPayloadStatus.SUCCESS,
		status,
		statusName: VerifyPayloadStatus[status],
	};
	if (cause) {
		result.cause = cause;
	}
	return result;
}

export async function verifyPayload(
	payload: string,
	payloadLength: bigint,
	payloadDigest: string,
): Promise<VerifyPayloadResult> {
	const expectedPayloadLength = BigInt(payload.length);
	if (payloadLength !== expectedPayloadLength) {
		return makeVerifyPayloadResult(
			VerifyPayloadStatus.INVALID_PAYLOAD_LENGTH,
			`received: ${payloadLength}; expected: ${expectedPayloadLength}`,
		);
	}

	const [algorithm, encoding] = payloadDigest.split(PAYLOAD_DIGEST_FIELDS_DELIMITER, 2);

	let expectedHash: string;
	try {
		expectedHash = await hashPayloadWith(payload, algorithm, encoding);
	} catch (e) {
		if (e instanceof UnsupportedHashAlgorithmError) {
			return makeVerifyPayloadResult(
				VerifyPayloadStatus.UNSUPPORTED_HASH_ALGORITHM,
				algorithm,
			);
		}
		if (e instanceof UnsupportedHashEncodingError) {
			return makeVerifyPayloadResult(VerifyPayloadStatus.UNSUPPORTED_HASH_ENCODING, encoding);
		}
		throw e;
	}

	if (payloadDigest !== expectedHash) {
		return makeVerifyPayloadResult(
			VerifyPayloadStatus.INVALID_HASH,
			`received: ${payloadDigest}; expected: ${expectedHash}`,
		);
	}

	return makeVerifyPayloadResult(VerifyPayloadStatus.SUCCESS);
}

class UnsupportedHashAlgorithmError extends Error {
	constructor(algorithm: string) {
		super("Unsupported algorithm", { cause: algorithm });
	}
}

class UnsupportedHashEncodingError extends Error {
	constructor(encoding: string) {
		super("Unsupported encoding", { cause: encoding });
	}
}

async function hashPayloadWith(
	payload: string,
	algorithm: string,
	encoding: string,
): Promise<string> {
	let algorithmFunction: (dataSource: BufferSource) => Promise<ArrayBuffer>;
	switch (algorithm) {
		case "sha256":
			algorithmFunction = (dataSource: BufferSource) => {
				return crypto.subtle.digest("SHA-256", dataSource);
			};
			break;
		default:
			throw new UnsupportedHashAlgorithmError(algorithm);
	}

	let encodingFunction: (buffer: ArrayBuffer) => Promise<string>;
	switch (encoding) {
		case "hex":
			encodingFunction = (buffer: ArrayBuffer) => {
				return Promise.resolve(Buffer.from(buffer).toString("hex"));
			};
			break;
		default:
			throw new UnsupportedHashEncodingError(encoding);
	}

	const encoder = new TextEncoder();
	const dataSource = encoder.encode(payload);
	const hash = await encodingFunction(await algorithmFunction(dataSource));
	return `${algorithm};${encoding};${hash}`;
}
