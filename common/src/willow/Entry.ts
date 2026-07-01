export interface Entry {
	namespaceId: string;
	subspaceId: string;
	path: string;
	timestamp: bigint;
	payloadLength: bigint;
	payloadDigest: string;
}

export function isEntry(value: unknown): value is Entry {
	return !!(
		value &&
		typeof value === "object" &&
		typeof value["namespaceId"] === "string" &&
		typeof value["subspaceId"] === "string" &&
		typeof value["path"] === "string" &&
		typeof value["timestamp"] === "bigint" &&
		typeof value["payloadLength"] === "bigint" &&
		typeof value["payloadDigest"] === "string"
	);
}

/**
 * @returns `true` if e1 is newer than e2, `false` otherwise
 */
export function isEntryNewerThan(e1: Entry, e2: Entry): boolean {
	return (
		e1.timestamp > e2.timestamp ||
		(e1.timestamp === e2.timestamp && e1.payloadDigest > e2.payloadDigest) ||
		(e1.timestamp === e2.timestamp &&
			e1.payloadDigest === e2.payloadDigest &&
			e1.payloadLength > e2.payloadLength)
	);
}
