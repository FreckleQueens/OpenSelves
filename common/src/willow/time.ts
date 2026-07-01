export const J2000_TO_UNIX_DIFFERENCE = 946684800_000_000n;

/**
 * Returns a timestamp from j2000 epoch in microseconds
 */
export function j2000Now(): bigint {
	const unixMilliseconds = performance.timeOrigin + performance.now();
	const unixMicroseconds = BigInt(Math.floor(unixMilliseconds * 1000));
	return unixMicroseconds - J2000_TO_UNIX_DIFFERENCE;
}

export function unixMillisecondsToJ2000Microseconds(unix: number) {
	return BigInt(unix) * 1000n - J2000_TO_UNIX_DIFFERENCE;
}
