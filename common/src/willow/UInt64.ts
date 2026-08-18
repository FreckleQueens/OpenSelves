import type { ByteProvider } from "./ByteProvider.js";
import { ByteString } from "./ByteString.js";

export class UInt64 extends BigInt {
	public static readonly MAX_VALUE = 18446744073709551615n;
	public static readonly UINT64_TO_INT64_OFFSET = 9223372036854775808n;
	public static readonly MAX_UINT_64_STRING_LENGTH = UInt64.MAX_VALUE.toString().length; // 20

	public static toInt64(input: UInt64): bigint {
		return input.valueOf() - UInt64.UINT64_TO_INT64_OFFSET;
	}

	public static fromInt64(input: bigint): UInt64 {
		return input + UInt64.UINT64_TO_INT64_OFFSET;
	}

	public static padForLexicographicalOrder(input: UInt64) {
		return input.toString().padStart(UInt64.MAX_UINT_64_STRING_LENGTH, "0");
	}

	public static is(value: unknown): value is UInt64 {
		return typeof value === "bigint";
	}

	public static isValid(value: UInt64): boolean {
		const raw = value.valueOf();
		return raw >= 0 && raw <= UInt64.MAX_VALUE;
	}

	public static encodeToVariable(
		input: UInt64,
		tagWidth: number,
	): {
		tag: number;
		additionalBytes: ByteString;
	} {
		if (tagWidth < 2) {
			throw new Error("tagWidth must be at least 2");
		}
		if (!UInt64.isValid(input)) {
			throw new Error("input must be a valid 64-bit unsigned integer");
		}

		const n = input.valueOf();
		if (n < 2 ** tagWidth - 4) {
			return {
				tag: Number(n),
				additionalBytes: ByteString.empty(),
			};
		}

		const bytes = new Uint8Array(
			Array(8)
				.fill(0)
				.map((_, index) => Number((n >> BigInt(index * 8)) & 0b1111_1111n)),
		);
		if (n < 256) {
			return {
				tag: 2 ** tagWidth - 4,
				additionalBytes: bytes.slice(0, 1),
			};
		} else if (n < 256 ** 2) {
			return {
				tag: 2 ** tagWidth - 3,
				additionalBytes: bytes.slice(0, 2),
			};
		} else if (n < 256 ** 4) {
			return {
				tag: 2 ** tagWidth - 2,
				additionalBytes: bytes.slice(0, 4),
			};
		} else {
			return {
				tag: 2 ** tagWidth - 1,
				additionalBytes: bytes,
			};
		}
	}

	public static encodeToVariable8(input: UInt64): ByteString {
		const parts = UInt64.encodeToVariable(input, 8);
		return ByteString.concat(new Uint8Array([parts.tag]), parts.additionalBytes);
	}

	public static async decodeVariable8(provider: ByteProvider): Promise<UInt64> {
		const tag = (await provider.read(1))[0];
		const variableLength = UInt64.decodeVariableBytesLength(tag, 8);
		if (variableLength > 0) {
			return UInt64.decodeVariableAdditionalBytes(await provider.read(variableLength));
		} else {
			return BigInt(tag);
		}
	}

	public static encodeVariable(
		val: UInt64,
		headerByte: number,
		tagWidth: number,
		bitBigEndianPosition: number,
	): {
		headerByte: number;
		additionalBytes: ByteString;
	} {
		if (tagWidth < 2 || tagWidth > 8) {
			throw new Error("tagWidth must be between 2 and 8 included", {
				cause: tagWidth,
			});
		}

		if (bitBigEndianPosition < 0 || bitBigEndianPosition > 7) {
			throw new Error("bitBigEndianPosition must be between 0 and 7 included", {
				cause: bitBigEndianPosition,
			});
		}

		const { tag, additionalBytes } = UInt64.encodeToVariable(val, tagWidth);

		const headerResult = headerByte | (tag << (8 - (bitBigEndianPosition + tagWidth)));

		return {
			headerByte: headerResult,
			additionalBytes,
		};
	}

	public static async decodeVariable(
		headerByte: number,
		tagWidth: number,
		bitBigEndianPosition: number,
		provider: ByteProvider,
	): Promise<UInt64> {
		if (tagWidth < 2 || tagWidth > 8) {
			throw new Error("tagWidth must be between 2 and 8 included", {
				cause: tagWidth,
			});
		}

		if (bitBigEndianPosition < 0 || bitBigEndianPosition > 7) {
			throw new Error("bitBigEndianPosition must be between 0 and 7 included", {
				cause: bitBigEndianPosition,
			});
		}

		const mask = 2 ** tagWidth - 1;
		const tag = (headerByte >> (8 - (bitBigEndianPosition + tagWidth))) & mask;
		let value: UInt64 = BigInt(tag);

		const variableLength = UInt64.decodeVariableBytesLength(tag, tagWidth);

		if (variableLength > 0) {
			value = UInt64.decodeVariableAdditionalBytes(await provider.read(variableLength));
		}

		return value;
	}

	public static decodeVariableBytesLength(tag: number, tagWidth: number) {
		switch (2 ** tagWidth - tag) {
			case 1:
				return 8;
			case 2:
				return 4;
			case 3:
				return 2;
			case 4:
				return 1;
			default:
				return 0;
		}
	}

	public static decodeVariableAdditionalBytes(bytes: ByteString): UInt64 {
		return bytes.reduce(
			(previousValue, currentValue, index) =>
				previousValue | (BigInt(currentValue) << BigInt(index * 8)),
			0n,
		);
	}
}
