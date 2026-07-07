import type { Entry } from "./Entry.js";
import { Store } from "./Store.js";

export class MemoryStore<T extends Entry, Context = void> extends Store<T, Context> {
	private _entries: T[] = [];

	public getEntries(): T[] {
		return [...this._entries];
	}

	protected addRemoveEntries(entryToAdd: T, entriesToRemove: T[]): Promise<void> {
		this._entries = this._entries.filter((entry) => !entriesToRemove.includes(entry));
		this._entries.push(entryToAdd);
		return Promise.resolve();
	}
}
