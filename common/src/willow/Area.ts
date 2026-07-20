import type { Entry } from "./Entry.js";
import { Path } from "./Path.js";
import { Store } from "./Store.js";
import { SubspaceId } from "./SubspaceId.js";
import type { Timestamp } from "./Timestamp.js";

export class Area<
	T extends Entry,
	Context = void,
	S extends Store<T, Context> = Store<T, Context>,
> {
	constructor(
		public readonly store: S,
		public readonly subspaceId: SubspaceId | undefined,
		public readonly path: Path,
		public readonly timesStart: Timestamp,
		public readonly timesEnd: Timestamp | "open",
	) {}

	public getEntries(context?: Context): T[] {
		return this.store.getEntries(context).filter((entry) => this.includesEntry(entry));
	}

	public async ingest(entries: T[], context?: Context): Promise<T[]> {
		if (entries.some((entry) => !this.includesEntry(entry))) {
			throw new Error("Got entry not included in area", {
				cause: entries,
			});
		}
		return this.store.ingest(entries, context);
	}

	public includesEntry(entry: T): boolean {
		return (
			(this.subspaceId === undefined ||
				SubspaceId.equals(entry.subspaceId, this.subspaceId)) &&
			Path.extends(entry.path, this.path) &&
			entry.timestamp >= this.timesStart &&
			(this.timesEnd === "open" || entry.timestamp < this.timesEnd)
		);
	}
}
