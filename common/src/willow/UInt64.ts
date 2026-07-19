import { ByteString } from "./ByteString.js";
import type { DropDecodeStep } from "./Drop.js";

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
		if (n <= 2 ** tagWidth - 5) {
			return {
				tag: Number(n),
				additionalBytes: new Uint8Array(0),
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

	public static decodeUint64Variable8(callback: (result: UInt64) => void): DropDecodeStep[] {
		return [
			{
				name: "decodeUint64Variable8 tag",
				consumedBytes: 1,
				decode(bytes) {
					const additionalBytesLength = UInt64.decodeVariableBytesLength(bytes[0], 8);
					if (additionalBytesLength === 0) {
						const result = BigInt(bytes[0]);
						if (!UInt64.isValid(result)) {
							throw new Error("Invalid UInt64", {
								cause: result,
							});
						}
						callback(result);
					}
					return additionalBytesLength;
				},
			},
			{
				name: "decodeUint64Variable8 additionalBytes",
				consumedBytes: 0,
				decode(bytes) {
					if (bytes.length > 0) {
						const result = UInt64.decodeVariableAdditionalBytes(bytes);
						if (!UInt64.isValid(result)) {
							throw new Error("Invalid UInt64", {
								cause: result,
							});
						}
						callback(result);
					}
				},
			},
		];
	}
}
