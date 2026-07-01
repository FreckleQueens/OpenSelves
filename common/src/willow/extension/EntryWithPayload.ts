import { type Entry, isEntry } from "../Entry.js";

export interface EntryWithPayload extends Entry {
	payload: string;
}

export function isEntryWithPayload(value: unknown): value is EntryWithPayload {
	return isEntry(value) && typeof value["payload"] === "string";
}
