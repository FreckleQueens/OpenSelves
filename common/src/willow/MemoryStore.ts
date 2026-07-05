import type { Entry } from "./Entry.js";
import { Store } from "./Store.js";

export class MemoryStore<T extends Entry> extends Store<T> {
	private _entries: T[] = [];

	public async getEntries(): Promise<T[]> {
		return Promise.resolve([...this._entries]);
	}

	protected updateEntries(entryToAdd: T, entriesToRemove: T[]): Promise<void> {
		this._entries = this._entries.filter((entry) => !entriesToRemove.includes(entry));
		this._entries.push(entryToAdd);
		return Promise.resolve();
	}
}
