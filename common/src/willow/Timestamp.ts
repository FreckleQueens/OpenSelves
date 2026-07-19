import { UInt64 } from "./UInt64.js";

export class Timestamp extends UInt64 {
	public static readonly J2000_TO_UNIX_DIFFERENCE = 946684800_000_000n;

	/**
	 * Returns a timestamp from j2000 epoch in microseconds
	 */
	public static now(): Timestamp {
		const unixMilliseconds = performance.timeOrigin + performance.now();
		const unixMicroseconds = BigInt(Math.floor(unixMilliseconds * 1000));
		return unixMicroseconds - Timestamp.J2000_TO_UNIX_DIFFERENCE;
	}

	public static unixMillisecondsToJ2000Microseconds(unix: number) {
		return BigInt(unix) * 1000n - Timestamp.J2000_TO_UNIX_DIFFERENCE;
	}

	public static is(value: unknown): value is Timestamp {
		return typeof value === "bigint";
	}

	public static isValid(value: Timestamp): value is Timestamp {
		return value.valueOf() >= 0n;
	}

	protected constructor() {
		super();
	}
}
