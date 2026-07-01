import { type Entry, isEntryNewerThan } from "./Entry.js";

export class Store<T extends Entry> {
	private _entries: T[] = [];

	constructor(public readonly namespaceId: string) {}

	public get entries(): T[] {
		return [...this._entries];
	}

	public ingest(...entries: T[]) {
		for (const entryToIngest of entries) {
			if (entryToIngest.namespaceId !== this.namespaceId) {
				throw new Error("Tried to ingest entry with wrong namespaceId", {
					cause: {
						actual: entryToIngest.namespaceId,
						expected: this.namespaceId,
					},
				});
			}

			// Drop incoming older path-prefixed entries
			if (
				this._entries.find(
					(entry) =>
						entry.subspaceId === entryToIngest.subspaceId &&
						entryToIngest.path.startsWith(entry.path) &&
						isEntryNewerThan(entry, entryToIngest),
				)
			) {
				continue;
			}

			// Delete in-store older path-prefixed entries
			this._entries = this._entries.filter(
				(entry) =>
					!(
						entry.subspaceId === entryToIngest.subspaceId &&
						entry.path.startsWith(entryToIngest.path) &&
						isEntryNewerThan(entryToIngest, entry)
					),
			);

			this._entries.push(entryToIngest);
		}
	}
}
