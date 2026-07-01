import type { Entry } from "../Entry.js";

export interface JsonFriendlyEntry extends Omit<Entry, "timestamp" | "payloadLength"> {
	namespaceId: string;
	subspaceId: string;
	path: string;
	timestamp: string;
	payloadLength: string;
	payloadDigest: string;
}

export function isJsonFriendlyEntry(value: unknown): value is JsonFriendlyEntry {
	return !!(
		value &&
		typeof value === "object" &&
		typeof value["namespaceId"] === "string" &&
		typeof value["subspaceId"] === "string" &&
		typeof value["path"] === "string" &&
		typeof value["timestamp"] === "string" &&
		typeof value["payloadLength"] === "string" &&
		typeof value["payloadDigest"] === "string"
	);
}

export function toJsonFriendly(entry: Entry): JsonFriendlyEntry {
	return {
		...entry,
		timestamp: entry.timestamp.toString(),
		payloadLength: entry.payloadLength.toString(),
	};
}

export function fromJsonFriendly(jsonFriendlyEntry: JsonFriendlyEntry): Entry {
	return {
		...jsonFriendlyEntry,
		timestamp: BigInt(jsonFriendlyEntry.timestamp),
		payloadLength: BigInt(jsonFriendlyEntry.payloadLength),
	};
}
