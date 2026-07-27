import { Area } from "../Area.js";
import type { Entry } from "../Entry.js";
import { Path } from "../Path.js";
import { SubspaceId } from "../SubspaceId.js";
import type { Timestamp } from "../Timestamp.js";
import { Store } from "./Store.js";

export class StoreArea<
	T extends Entry,
	Context = void,
	S extends Store<T, Context> = Store<T, Context>,
> {
	public readonly area: Area;

	public constructor(
		public readonly store: S,
		subspaceId: SubspaceId | undefined,
		path: Path,
		timesStart: Timestamp,
		timesEnd: Timestamp | undefined,
	) {
		this.area = new Area(subspaceId, path, { start: timesStart, end: timesEnd });
	}

	public getEntries(context?: Context): T[] {
		return this.store
			.getEntries(context)
			.filter((entry) => Area.includesEntry(this.area, entry));
	}

	public async ingest(entries: T[], context?: Context): Promise<T[]> {
		if (entries.some((entry) => !Area.includesEntry(this.area, entry))) {
			throw new Error("Got entry not included in area", {
				cause: entries,
			});
		}
		return this.store.ingest(entries, context);
	}
}
