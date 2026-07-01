import type { Entry } from "../Entry.js";
import { type EntryWithPayload, isEntryWithPayload } from "./EntryWithPayload.js";
import {
	type JsonFriendlyEntry,
	fromJsonFriendly,
	isJsonFriendlyEntry,
	toJsonFriendly,
} from "./JsonFriendlyEntry.js";

export interface JsonFriendlyEntryWithPayload extends JsonFriendlyEntry {
	payload: string;
}

export function isJsonFriendlyEntryWithPayload(
	value: unknown,
): value is JsonFriendlyEntryWithPayload {
	return isJsonFriendlyEntry(value) && typeof value["payload"] === "string";
}

export function toJsonFriendlyWithPayload(entry: EntryWithPayload): JsonFriendlyEntryWithPayload {
	return {
		...toJsonFriendly(entry),
		payload: entry.payload,
	};
}

export function toJsonFriendlyMaybeWithPayload(
	entry: Entry | EntryWithPayload,
): JsonFriendlyEntry | JsonFriendlyEntryWithPayload {
	if (isEntryWithPayload(entry)) {
		return toJsonFriendlyWithPayload(entry);
	} else {
		return toJsonFriendly(entry);
	}
}

export function fromJsonFriendlyWithPayload(
	jsonFriendlyEntryWithPayload: JsonFriendlyEntryWithPayload,
): EntryWithPayload {
	return {
		...jsonFriendlyEntryWithPayload,
		timestamp: BigInt(jsonFriendlyEntryWithPayload.timestamp),
		payloadLength: BigInt(jsonFriendlyEntryWithPayload.payloadLength),
	};
}

export function fromJsonFriendlyMaybeWithPayload(
	jsonFriendlyEntry: JsonFriendlyEntry | JsonFriendlyEntryWithPayload,
): Entry | EntryWithPayload {
	if (isJsonFriendlyEntryWithPayload(jsonFriendlyEntry)) {
		return fromJsonFriendlyWithPayload(jsonFriendlyEntry);
	} else {
		return fromJsonFriendly(jsonFriendlyEntry);
	}
}
