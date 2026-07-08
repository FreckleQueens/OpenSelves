export const MAX_UINT64 = 18446744073709551615n;
export const UINT64_TO_INT64_OFFSET = 9223372036854775808n;
export const MAX_UINT_64_STRING_LENGTH = MAX_UINT64.toString().length; // 20

export function uint64ToInt64(input: bigint): bigint {
	return input - UINT64_TO_INT64_OFFSET;
}
export function int64toUint64(input: bigint): bigint {
	return input + UINT64_TO_INT64_OFFSET;
}

export function padUint64(input: bigint | string) {
	return input.toString().padStart(MAX_UINT_64_STRING_LENGTH, "0");
}
